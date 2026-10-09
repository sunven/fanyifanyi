use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;

const WINDOW_LABEL: &str = "clipboard-translation";

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardSession {
    id: u64,
    source_text: String,
    error: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
struct Origin {
    pid: i32,
    launched_at: f64,
    window_label: Option<String>,
}

#[derive(Default)]
struct Sessions {
    screenshot_preparing: bool,
    next_id: u64,
    current: Option<ClipboardSession>,
    origin: Option<Origin>,
}

impl Sessions {
    fn update(
        &mut self,
        source_text: String,
        error: Option<String>,
        origin: Option<Origin>,
    ) -> u64 {
        if let Some(origin) = origin {
            self.origin = Some(origin);
        }
        if let Some(current) = &self.current {
            if error.is_none() && current.error.is_none() && current.source_text == source_text {
                return current.id;
            }
        }
        self.next_id += 1;
        let id = self.next_id;
        self.current = Some(ClipboardSession {
            id,
            source_text,
            error,
        });
        id
    }

    fn clear(&mut self) -> Option<Origin> {
        self.current = None;
        self.origin.take()
    }
}

pub(crate) fn initialize(app: &tauri::AppHandle) {
    app.manage(Mutex::new(Sessions::default()));
}

pub(crate) fn start(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = platform::start(&handle) {
                log::warn!("打开快捷翻译失败：{error}");
            }
        }) {
            log::warn!("调度快捷翻译失败：{error}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[tauri::command]
pub(crate) async fn get_clipboard_translation_session(
    app: tauri::AppHandle,
) -> Result<Option<ClipboardSession>, String> {
    let state = app.state::<Mutex<Sessions>>();
    let sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
    Ok(sessions.current.clone())
}

#[tauri::command]
pub(crate) async fn is_clipboard_translation_current(
    app: tauri::AppHandle,
    id: u64,
) -> Result<bool, String> {
    Ok(get_clipboard_translation_session(app)
        .await?
        .is_some_and(|session| session.id == id))
}

// Keep validation and persistence in one critical section so replaced/closed
// sessions cannot append a late translation result to history.
pub(crate) fn with_current_session<T>(
    app: &tauri::AppHandle,
    id: u64,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<Option<T>, String> {
    let state = app.state::<Mutex<Sessions>>();
    with_session_state(&state, id, action)
}

fn with_session_state<T>(
    state: &Mutex<Sessions>,
    id: u64,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<Option<T>, String> {
    let sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
    if sessions
        .current
        .as_ref()
        .is_some_and(|session| session.id == id)
    {
        action().map(Some)
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub(crate) async fn close_clipboard_translation(
    app: tauri::AppHandle,
    restore_focus: bool,
    id: Option<u64>,
    suspend_for_screenshot: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let handle = app.clone();
        app.run_on_main_thread(move || {
            let result = (|| {
                if suspend_for_screenshot == Some(true) {
                    handle
                        .state::<Mutex<Sessions>>()
                        .lock()
                        .map_err(|_| "快捷翻译状态不可用".to_string())?
                        .screenshot_preparing = true;
                }
                close(&handle, restore_focus, id)
            })();
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
        receiver.recv().map_err(|error| error.to_string())?
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn resume_clipboard_translation(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<Mutex<Sessions>>()
        .lock()
        .map_err(|_| "快捷翻译状态不可用".to_string())?
        .screenshot_preparing = false;
    Ok(())
}

fn close(app: &tauri::AppHandle, restore_focus: bool, id: Option<u64>) -> Result<(), String> {
    if let Some(id) = id {
        let state = app.state::<Mutex<Sessions>>();
        let sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
        if !sessions
            .current
            .as_ref()
            .is_some_and(|session| session.id == id)
        {
            return Ok(());
        }
    }
    let window = app.get_webview_window(WINDOW_LABEL);
    let focused = window
        .as_ref()
        .is_some_and(|window| window.is_focused().unwrap_or(false));
    let origin = app
        .state::<Mutex<Sessions>>()
        .lock()
        .map_err(|_| "快捷翻译状态不可用".to_string())?
        .clear();
    if let Some(window) = window {
        window.destroy().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    if restore_focus && focused {
        if let Some(origin) = origin {
            platform::restore(app, origin);
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (restore_focus, focused, origin);
    Ok(())
}

pub(crate) fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == WINDOW_LABEL {
        match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Err(error) = close(window.app_handle(), true, None) {
                    log::warn!("关闭快捷翻译失败：{error}");
                }
            }
            tauri::WindowEvent::Destroyed => {
                if let Some(state) = window.try_state::<Mutex<Sessions>>() {
                    if let Ok(mut sessions) = state.lock() {
                        sessions.clear();
                    }
                }
            }
            _ => {}
        }
    } else if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
        let _ = close(window.app_handle(), false, None);
    }
}

fn clipboard_text(text: Option<String>) -> Result<String, String> {
    match text {
        Some(text) if !text.trim().is_empty() => Ok(text),
        Some(_) => Err("剪贴板文字为空，请复制文字后再试".to_string()),
        None => Err("剪贴板没有可翻译的文字，请复制文字后再试".to_string()),
    }
}

fn popup_position(cursor: f64, start: f64, available: f64, size: f64) -> f64 {
    (cursor + 12.0)
        .max(start)
        .min((start + available - size).max(start))
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use objc2::{class, msg_send, rc::Retained, runtime::AnyObject, sel};
    use objc2_foundation::NSString;
    use tauri::{Emitter, WebviewUrl, WebviewWindowBuilder};

    // Called only on the AppKit main thread. Keep native objects local; only copied
    // process identity and text cross into the application's Send + Sync state.
    fn clipboard() -> Result<String, String> {
        unsafe {
            let board: Option<Retained<AnyObject>> =
                msg_send![class!(NSPasteboard), generalPasteboard];
            let board = board.ok_or_else(|| "无法读取剪贴板，请重新复制后再试".to_string())?;
            let kind = NSString::from_str("public.utf8-plain-text");
            let text: Option<Retained<NSString>> = msg_send![&*board, stringForType: &*kind];
            clipboard_text(text.map(|text| text.to_string()))
        }
    }

    unsafe fn launch_time(application: &AnyObject) -> Option<f64> {
        let date: Option<Retained<AnyObject>> = msg_send![application, launchDate];
        date.map(|date| msg_send![&*date, timeIntervalSinceReferenceDate])
    }

    fn origin(app: &tauri::AppHandle) -> Option<Origin> {
        unsafe {
            let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
            let application: Option<Retained<AnyObject>> =
                msg_send![workspace, frontmostApplication];
            let application = application?;
            let pid: i32 = msg_send![&*application, processIdentifier];
            let window_label = if pid == std::process::id() as i32 {
                let windows = app.webview_windows();
                let focused = windows
                    .values()
                    .find(|window| window.is_focused().unwrap_or(false))?;
                // Repeated invocation from the popup keeps its original source.
                if focused.label() == WINDOW_LABEL {
                    return None;
                }
                Some(focused.label().to_string())
            } else {
                None
            };
            Some(Origin {
                pid,
                launched_at: launch_time(&application)?,
                window_label,
            })
        }
    }

    pub(super) fn restore(app: &tauri::AppHandle, origin: Origin) {
        unsafe {
            let application: Option<Retained<AnyObject>> = msg_send![class!(NSRunningApplication), runningApplicationWithProcessIdentifier: origin.pid];
            if let Some(application) = application {
                let terminated: bool = msg_send![&*application, isTerminated];
                // Launch identity prevents a recycled PID from selecting an unrelated app.
                if !terminated && launch_time(&application) == Some(origin.launched_at) {
                    if let Some(label) = origin.window_label {
                        if let Some(window) = app.get_webview_window(&label) {
                            if let Err(error) = window.set_focus() {
                                log::warn!("恢复来源窗口失败：{error}");
                            }
                        }
                    } else {
                        let current: *mut AnyObject =
                            msg_send![class!(NSApplication), sharedApplication];
                        let cooperative: bool = msg_send![current, respondsToSelector: sel!(yieldActivationToApplication:)];
                        let activated: bool = if cooperative {
                            let _: () =
                                msg_send![current, yieldActivationToApplication: &*application];
                            let running: *mut AnyObject =
                                msg_send![class!(NSRunningApplication), currentApplication];
                            msg_send![&*application, activateFromApplication: running, options: 0usize]
                        } else {
                            // Before macOS 14, explicit activation is the available handoff API.
                            msg_send![&*application, activateWithOptions: 2usize]
                        };
                        if !activated {
                            log::debug!("来源应用未接受快捷翻译焦点恢复");
                        }
                    }
                }
            }
        }
    }

    fn pointer_position(
        app: &tauri::AppHandle,
        width: f64,
        height: f64,
    ) -> Option<tauri::LogicalPosition<f64>> {
        let cursor = app.cursor_position().ok()?;
        let monitor = app.monitor_from_point(cursor.x, cursor.y).ok()??;
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let start = area.position.to_logical::<f64>(scale);
        let size = area.size.to_logical::<f64>(scale);
        let cursor = cursor.to_logical::<f64>(scale);
        Some(tauri::LogicalPosition::new(
            popup_position(cursor.x, start.x, size.width, width),
            popup_position(cursor.y, start.y, size.height, height),
        ))
    }

    pub(super) fn start(app: &tauri::AppHandle) -> Result<(), String> {
        if app
            .state::<Mutex<Sessions>>()
            .lock()
            .map_err(|_| "快捷翻译状态不可用".to_string())?
            .screenshot_preparing
        {
            return Ok(());
        }
        if let Some(selection) = app
            .webview_windows()
            .values()
            .find(|window| window.label().starts_with("screenshot-selection-"))
        {
            selection.set_focus().map_err(|error| error.to_string())?;
            return Ok(());
        }
        let origin = origin(app);
        let (text, error) = match clipboard() {
            Ok(text) => (text, None),
            Err(error) => (String::new(), Some(error)),
        };
        let (id, changed) = {
            let state = app.state::<Mutex<Sessions>>();
            let mut sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
            let previous = sessions.current.as_ref().map(|session| session.id);
            let id = sessions.update(text, error, origin);
            (id, previous != Some(id))
        };
        let window = if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            if changed {
                let size = window
                    .outer_size()
                    .ok()
                    .and_then(|size| {
                        window
                            .scale_factor()
                            .ok()
                            .map(|scale| size.to_logical::<f64>(scale))
                    })
                    .unwrap_or(tauri::LogicalSize::new(420.0, 360.0));
                if let Some(position) = pointer_position(app, size.width, size.height) {
                    window
                        .set_position(position)
                        .map_err(|error| error.to_string())?;
                }
            }
            window
        } else {
            let mut builder = WebviewWindowBuilder::new(
                app,
                WINDOW_LABEL,
                WebviewUrl::App("/?window=clipboard-translation".into()),
            )
            .title("快捷翻译")
            .inner_size(420.0, 360.0)
            .min_inner_size(300.0, 240.0)
            .always_on_top(true)
            .focused(true);
            if let Some(position) = pointer_position(app, 420.0, 360.0) {
                builder = builder.position(position.x, position.y);
            }
            match builder.build() {
                Ok(window) => window,
                Err(error) => {
                    if let Ok(mut sessions) = app.state::<Mutex<Sessions>>().lock() {
                        sessions.clear();
                    }
                    return Err(error.to_string());
                }
            }
        };
        window
            .emit("clipboard-translation-changed", id)
            .map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin(pid: i32) -> Origin {
        Origin {
            pid,
            launched_at: 123.0,
            window_label: None,
        }
    }

    #[test]
    fn closing_popup_does_not_resume_clipboard_reads_during_screenshot_preparation() {
        let mut sessions = Sessions::default();
        sessions.update("text".into(), None, None);
        sessions.screenshot_preparing = true;
        sessions.clear();
        assert!(sessions.screenshot_preparing);
        assert!(sessions.current.is_none());
    }

    #[test]
    fn history_guard_rejects_closed_and_replaced_sessions_and_holds_lock_during_write() {
        let state = Mutex::new(Sessions::default());
        let first = state.lock().unwrap().update("first".into(), None, None);
        let result = with_session_state(&state, first, || {
            assert!(
                state.try_lock().is_err(),
                "replacement and closure must wait for the write"
            );
            Ok("saved")
        })
        .unwrap();
        assert_eq!(result, Some("saved"));
        state.lock().unwrap().update("second".into(), None, None);
        assert_eq!(
            with_session_state(&state, first, || -> Result<(), String> {
                panic!("replaced session must not persist")
            })
            .unwrap(),
            None
        );
        state.lock().unwrap().clear();
        assert_eq!(
            with_session_state(&state, first, || -> Result<(), String> {
                panic!("closed session must not persist")
            })
            .unwrap(),
            None
        );
    }

    #[test]
    fn history_guard_propagates_storage_failure() {
        let state = Mutex::new(Sessions::default());
        let id = state.lock().unwrap().update("first".into(), None, None);
        assert_eq!(
            with_session_state(&state, id, || -> Result<(), String> {
                Err("disk full".into())
            }),
            Err("disk full".into())
        );
    }

    #[test]
    fn clipboard_requires_nonblank_text_and_preserves_source_formatting() {
        assert!(clipboard_text(None).is_err());
        assert!(clipboard_text(Some(" \n\t".into())).is_err());
        assert_eq!(clipboard_text(Some("  code\n".into())).unwrap(), "  code\n");
    }

    #[test]
    fn repeated_text_keeps_session_and_new_text_invalidates_it() {
        let mut sessions = Sessions::default();
        let first = sessions.update("first".into(), None, Some(origin(1)));
        assert_eq!(sessions.update("first".into(), None, None), first);
        assert_eq!(sessions.origin, Some(origin(1)));
        assert!(sessions.update("second".into(), None, Some(origin(2))) > first);
        assert_eq!(sessions.clear(), Some(origin(2)));
        assert!(sessions.current.is_none());
        assert!(sessions.update("first".into(), None, None) > first);
    }

    #[test]
    fn errors_can_be_retried_and_cleared() {
        let mut sessions = Sessions::default();
        let error = sessions.update(String::new(), Some("empty".into()), Some(origin(1)));
        let retry = sessions.update(String::new(), Some("empty".into()), None);
        assert!(retry > error);
        sessions.update("text".into(), None, None);
        assert!(sessions.current.unwrap().error.is_none());
    }

    #[test]
    fn popup_stays_inside_work_area_including_negative_displays() {
        assert_eq!(popup_position(200.0, 0.0, 1920.0, 420.0), 212.0);
        assert_eq!(popup_position(1900.0, 0.0, 1920.0, 420.0), 1500.0);
        assert_eq!(popup_position(-1900.0, -1920.0, 1920.0, 420.0), -1888.0);
        assert_eq!(popup_position(100.0, 0.0, 300.0, 420.0), 0.0);
    }
}
