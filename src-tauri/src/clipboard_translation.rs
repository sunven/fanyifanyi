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
    permission_required: bool,
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
    next_popup_generation: u64,
    popup_generation: Option<u64>,
    pending_cleanup: Option<PendingCleanup>,
}

struct PendingCleanup {
    id: Option<u64>,
    generation: u64,
    origin: Option<Origin>,
    restore_focus: bool,
    destroy_requested: bool,
    completion: Vec<std::sync::mpsc::SyncSender<Result<(), String>>>,
}

impl Sessions {
    fn update(
        &mut self,
        source_text: String,
        error: Option<String>,
        permission_required: bool,
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
            permission_required,
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
    dispatch(app, false);
}

pub(crate) fn start_selection(app: &tauri::AppHandle) {
    dispatch(app, true);
}

fn dispatch(app: &tauri::AppHandle, selection: bool) {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = platform::start(&handle, selection) {
                log::warn!("打开快捷翻译失败：{error}");
            }
        }) {
            log::warn!("调度快捷翻译失败：{error}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, selection);
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
            close_with_completion(
                &handle.state::<Mutex<Sessions>>(),
                &Native(&handle),
                restore_focus,
                id,
                suspend_for_screenshot == Some(true),
                sender,
            );
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

// This internal seam keeps lifecycle order testable without exposing native windows.
trait LifecycleAdapter {
    fn focus_screenshot(&self) -> Result<bool, String>;
    fn popup_focused(&self) -> bool;
    fn capture(&self, selection: bool) -> CapturedSource;
    fn ensure_popup(&self, generation: u64) -> Result<(), String>;
    fn position(&self) -> Result<(), String>;
    fn emit(&self, id: u64) -> Result<(), String>;
    fn show(&self) -> Result<(), String>;
    fn focus(&self) -> Result<(), String>;
    // True means destruction is confirmed; native windows confirm via Destroyed.
    fn destroy(&self) -> Result<bool, String>;
    fn restore(&self, origin: Origin);
}

struct CapturedSource {
    text: String,
    error: Option<String>,
    permission_required: bool,
    origin: Option<Origin>,
}

fn start_lifecycle(
    state: &Mutex<Sessions>,
    native: &impl LifecycleAdapter,
    selection: bool,
) -> Result<(), String> {
    {
        let sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
        if sessions.screenshot_preparing {
            return Ok(());
        }
    }
    if native.focus_screenshot()? {
        return Ok(());
    }
    let pending_cleanup = state
        .lock()
        .map_err(|_| "快捷翻译状态不可用".to_string())?
        .pending_cleanup
        .is_some();
    if pending_cleanup {
        finish_cleanup(state, native)?;
        // Cleanup can restore the previous source. A fresh shortcut must capture
        // the intended source, rather than reading during that focus handoff.
        return Err("快捷翻译窗口正在关闭，请重试".to_string());
    }
    if selection && native.popup_focused() {
        return Ok(());
    }
    // Capture the source before creating, showing, or focusing the popup.
    let source = native.capture(selection);
    let (id, changed, generation) = {
        let mut sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
        let previous = sessions.current.as_ref().map(|session| session.id);
        let id = sessions.update(
            source.text,
            source.error,
            source.permission_required,
            source.origin,
        );
        let generation = match sessions.popup_generation {
            Some(generation) => generation,
            None => {
                sessions.next_popup_generation += 1;
                let generation = sessions.next_popup_generation;
                sessions.popup_generation = Some(generation);
                generation
            }
        };
        (id, previous != Some(id), generation)
    };
    let display = (|| {
        native.ensure_popup(generation)?;
        if changed {
            if let Err(error) = native.position() {
                log::warn!("定位快捷翻译失败：{error}");
            }
        }
        native.emit(id)?;
        native.show()
    })();
    if let Err(error) = display {
        if let Err(cleanup) = close_lifecycle(state, native, false, Some(id)) {
            log::warn!("清理快捷翻译失败：{cleanup}");
        }
        return Err(error);
    }
    // A visible result remains usable even when the OS declines focus.
    native.focus()
}

fn close_lifecycle(
    state: &Mutex<Sessions>,
    native: &impl LifecycleAdapter,
    restore_focus: bool,
    id: Option<u64>,
) -> Result<(), String> {
    let needs_focus = {
        let mut sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
        if let Some(id) = id {
            let current = sessions
                .current
                .as_ref()
                .is_some_and(|session| session.id == id);
            let pending = sessions
                .pending_cleanup
                .as_ref()
                .is_some_and(|cleanup| cleanup.id == Some(id));
            if !current && !pending {
                return Ok(());
            }
        }
        if sessions.pending_cleanup.is_some() {
            false
        } else {
            let id = sessions.current.as_ref().map(|session| session.id);
            let origin = sessions.clear();
            if let Some(generation) = sessions.popup_generation {
                sessions.pending_cleanup = Some(PendingCleanup {
                    id,
                    generation,
                    origin,
                    restore_focus: false,
                    destroy_requested: false,
                    completion: Vec::new(),
                });
                restore_focus
            } else {
                false
            }
        }
    };
    // Invalidate before any native call; a failed destroy must still reject history.
    if needs_focus {
        let focused = native.popup_focused();
        if let Some(cleanup) = state
            .lock()
            .map_err(|_| "快捷翻译状态不可用".to_string())?
            .pending_cleanup
            .as_mut()
        {
            cleanup.restore_focus = focused;
        }
    }
    finish_cleanup(state, native)
}

// The command waits off the main thread. Success means the popup was actually
// destroyed, so screenshot capture cannot race an enqueued destroy request.
fn close_with_completion(
    state: &Mutex<Sessions>,
    native: &impl LifecycleAdapter,
    restore_focus: bool,
    id: Option<u64>,
    suspend_for_screenshot: bool,
    sender: std::sync::mpsc::SyncSender<Result<(), String>>,
) {
    let result = (|| {
        if suspend_for_screenshot {
            let mut sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
            sessions.screenshot_preparing = true;
            if let Some(cleanup) = sessions.pending_cleanup.as_mut() {
                cleanup.restore_focus = false;
            }
        }
        close_lifecycle(state, native, restore_focus && !suspend_for_screenshot, id)?;
        let mut sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
        if let Some(cleanup) = sessions.pending_cleanup.as_mut() {
            if id.is_none() || cleanup.id == id {
                cleanup.completion.push(sender.clone());
                return Ok(true);
            }
        }
        Ok(false)
    })();
    match result {
        Ok(true) => {}
        Ok(false) => {
            let _ = sender.send(Ok(()));
        }
        Err(error) => {
            let _ = sender.send(Err(error));
        }
    }
}

fn finish_cleanup(state: &Mutex<Sessions>, native: &impl LifecycleAdapter) -> Result<(), String> {
    let pending = state
        .lock()
        .map_err(|_| "快捷翻译状态不可用".to_string())?
        .pending_cleanup
        .as_ref()
        .map(|cleanup| (cleanup.generation, cleanup.destroy_requested));
    if let Some((generation, false)) = pending {
        if native.destroy()? {
            popup_destroyed(state, native, generation)?;
        } else if let Some(cleanup) = state
            .lock()
            .map_err(|_| "快捷翻译状态不可用".to_string())?
            .pending_cleanup
            .as_mut()
        {
            cleanup.destroy_requested = true;
        }
    }
    Ok(())
}

fn popup_destroyed(
    state: &Mutex<Sessions>,
    native: &impl LifecycleAdapter,
    generation: u64,
) -> Result<(), String> {
    let cleanup = {
        let mut sessions = state.lock().map_err(|_| "快捷翻译状态不可用".to_string())?;
        // The label is reused. A delayed callback belongs only to its own popup.
        if sessions.popup_generation != Some(generation) {
            return Ok(());
        }
        sessions.popup_generation = None;
        sessions.clear();
        sessions.pending_cleanup.take()
    };
    if let Some(cleanup) = cleanup {
        if cleanup.restore_focus {
            if let Some(origin) = cleanup.origin {
                native.restore(origin);
            }
        }
        for sender in cleanup.completion {
            let _ = sender.send(Ok(()));
        }
    }
    Ok(())
}

fn close(app: &tauri::AppHandle, restore_focus: bool, id: Option<u64>) -> Result<(), String> {
    close_lifecycle(
        &app.state::<Mutex<Sessions>>(),
        &Native(app),
        restore_focus,
        id,
    )
}

pub(crate) fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == WINDOW_LABEL {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(error) = close(window.app_handle(), true, None) {
                log::warn!("关闭快捷翻译失败：{error}");
            }
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

struct Native<'a>(&'a tauri::AppHandle);

impl Native<'_> {
    fn popup(&self) -> Result<tauri::WebviewWindow, String> {
        self.0
            .get_webview_window(WINDOW_LABEL)
            .ok_or_else(|| "快捷翻译窗口不可用".to_string())
    }
}

impl LifecycleAdapter for Native<'_> {
    fn focus_screenshot(&self) -> Result<bool, String> {
        if let Some(window) = self
            .0
            .webview_windows()
            .values()
            .find(|window| window.label().starts_with("screenshot-selection-"))
        {
            window.set_focus().map_err(|error| error.to_string())?;
            return Ok(true);
        }
        Ok(false)
    }

    fn popup_focused(&self) -> bool {
        self.0
            .get_webview_window(WINDOW_LABEL)
            .is_some_and(|window| window.is_focused().unwrap_or(false))
    }

    fn capture(&self, selection: bool) -> CapturedSource {
        #[cfg(target_os = "macos")]
        {
            platform::capture(self.0, selection)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = selection;
            unreachable!("native shortcuts are macOS-only")
        }
    }

    fn ensure_popup(&self, generation: u64) -> Result<(), String> {
        if self.0.get_webview_window(WINDOW_LABEL).is_some() {
            return Ok(());
        }
        let window = tauri::WebviewWindowBuilder::new(
            self.0,
            WINDOW_LABEL,
            tauri::WebviewUrl::App("/?window=clipboard-translation".into()),
        )
        .title("快捷翻译")
        .inner_size(420.0, 360.0)
        .min_inner_size(300.0, 240.0)
        .always_on_top(true)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|error| error.to_string())?;
        let app = self.0.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Err(error) =
                    popup_destroyed(&app.state::<Mutex<Sessions>>(), &Native(&app), generation)
                {
                    log::warn!("清理快捷翻译状态失败：{error}");
                }
            }
        });
        Ok(())
    }

    fn position(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let window = self.popup()?;
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
            if let Some(position) = platform::pointer_position(self.0, size.width, size.height) {
                window
                    .set_position(position)
                    .map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }

    fn emit(&self, id: u64) -> Result<(), String> {
        use tauri::Emitter;
        self.popup()?
            .emit("clipboard-translation-changed", id)
            .map_err(|error| error.to_string())
    }
    fn show(&self) -> Result<(), String> {
        self.popup()?.show().map_err(|error| error.to_string())
    }
    fn focus(&self) -> Result<(), String> {
        self.popup()?.set_focus().map_err(|error| error.to_string())
    }
    fn destroy(&self) -> Result<bool, String> {
        if let Some(window) = self.0.get_webview_window(WINDOW_LABEL) {
            window.destroy().map_err(|error| error.to_string())?;
            Ok(false)
        } else {
            Ok(true)
        }
    }
    fn restore(&self, origin: Origin) {
        #[cfg(target_os = "macos")]
        platform::restore(self.0, origin);
        #[cfg(not(target_os = "macos"))]
        let _ = origin;
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use objc2::{class, msg_send, rc::Retained, runtime::AnyObject, sel};
    use objc2_foundation::NSString;

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

    pub(super) fn pointer_position(
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

    pub(super) fn capture(app: &tauri::AppHandle, selection: bool) -> CapturedSource {
        let origin = origin(app);
        // Capture before showing/focusing the popup, while the source owns its selection.
        let (text, error, permission_required) = if selection {
            match origin.as_ref() {
                Some(origin) => {
                    match crate::selection_translation::read_selected_text(origin.pid) {
                        Ok(text) => (text, None, false),
                        Err(error) => (
                            String::new(),
                            Some(error.to_string()),
                            error.code() == "permission_required",
                        ),
                    }
                }
                None => (
                    String::new(),
                    Some("未能读取来源应用，请返回网页选中文字后重试".to_string()),
                    false,
                ),
            }
        } else {
            match clipboard() {
                Ok(text) => (text, None, false),
                Err(error) => (String::new(), Some(error), false),
            }
        };
        CapturedSource {
            text,
            error,
            permission_required,
            origin,
        }
    }

    pub(super) fn start(app: &tauri::AppHandle, selection: bool) -> Result<(), String> {
        start_lifecycle(&app.state::<Mutex<Sessions>>(), &Native(app), selection)
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
        sessions.update("text".into(), None, false, None);
        sessions.screenshot_preparing = true;
        sessions.clear();
        assert!(sessions.screenshot_preparing);
        assert!(sessions.current.is_none());
    }

    #[test]
    fn history_guard_rejects_closed_and_replaced_sessions_and_holds_lock_during_write() {
        let state = Mutex::new(Sessions::default());
        let first = state
            .lock()
            .unwrap()
            .update("first".into(), None, false, None);
        let result = with_session_state(&state, first, || {
            assert!(
                state.try_lock().is_err(),
                "replacement and closure must wait for the write"
            );
            Ok("saved")
        })
        .unwrap();
        assert_eq!(result, Some("saved"));
        state
            .lock()
            .unwrap()
            .update("second".into(), None, false, None);
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
        let id = state
            .lock()
            .unwrap()
            .update("first".into(), None, false, None);
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
        let first = sessions.update("first".into(), None, false, Some(origin(1)));
        assert_eq!(sessions.update("first".into(), None, false, None), first);
        assert_eq!(sessions.origin, Some(origin(1)));
        assert!(sessions.update("second".into(), None, false, Some(origin(2))) > first);
        assert_eq!(sessions.clear(), Some(origin(2)));
        assert!(sessions.current.is_none());
        assert!(sessions.update("first".into(), None, false, None) > first);
    }

    #[test]
    fn errors_can_be_retried_and_cleared() {
        let mut sessions = Sessions::default();
        let error = sessions.update(String::new(), Some("empty".into()), false, Some(origin(1)));
        let retry = sessions.update(String::new(), Some("empty".into()), false, None);
        assert!(retry > error);
        sessions.update("text".into(), None, false, None);
        assert!(sessions.current.unwrap().error.is_none());
    }

    #[test]
    fn permission_failure_invalidates_old_translation_and_success_clears_guidance() {
        let mut sessions = Sessions::default();
        let first = sessions.update("old text".into(), None, false, Some(origin(1)));
        let failure = sessions.update(
            String::new(),
            Some("permission required".into()),
            true,
            Some(origin(2)),
        );
        assert!(failure > first);
        let current = sessions.current.as_ref().unwrap();
        assert!(current.source_text.is_empty());
        assert!(current.permission_required);
        assert_eq!(sessions.origin, Some(origin(2)));
        let success = sessions.update("selected text".into(), None, false, Some(origin(2)));
        assert!(success > failure);
        let current = sessions.current.as_ref().unwrap();
        assert!(!current.permission_required);
        assert!(current.error.is_none());
    }

    #[test]
    fn same_text_from_another_application_updates_return_destination() {
        let mut sessions = Sessions::default();
        let first = sessions.update("same text".into(), None, false, Some(origin(1)));
        assert_eq!(
            sessions.update("same text".into(), None, false, Some(origin(2))),
            first
        );
        assert_eq!(sessions.clear(), Some(origin(2)));
    }

    #[test]
    fn popup_stays_inside_work_area_including_negative_displays() {
        assert_eq!(popup_position(200.0, 0.0, 1920.0, 420.0), 212.0);
        assert_eq!(popup_position(1900.0, 0.0, 1920.0, 420.0), 1500.0);
        assert_eq!(popup_position(-1900.0, -1920.0, 1920.0, 420.0), -1888.0);
        assert_eq!(popup_position(100.0, 0.0, 300.0, 420.0), 0.0);
    }
}

#[cfg(test)]
#[path = "clipboard_translation/lifecycle_tests.rs"]
mod lifecycle_tests;
