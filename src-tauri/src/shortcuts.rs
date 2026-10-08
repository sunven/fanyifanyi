use serde::Serialize;

const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+T";

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct ShortcutSettings {
    supported: bool,
    enabled: bool,
    shortcut: String,
    error: Option<String>,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            supported: cfg!(target_os = "macos"),
            enabled: cfg!(target_os = "macos"),
            shortcut: DEFAULT_SHORTCUT.to_string(),
            error: None,
        }
    }
}

pub(crate) fn initialize(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    platform::initialize(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[tauri::command]
pub(crate) async fn get_screenshot_shortcut(
    app: tauri::AppHandle,
) -> Result<ShortcutSettings, String> {
    #[cfg(target_os = "macos")]
    return platform::settings(&app);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(ShortcutSettings::default())
    }
}

#[tauri::command]
pub(crate) async fn configure_screenshot_shortcut(
    app: tauri::AppHandle,
    enabled: bool,
    shortcut: String,
) -> Result<ShortcutSettings, String> {
    #[cfg(target_os = "macos")]
    return platform::configure(&app, enabled, shortcut);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, enabled, shortcut);
        Err("全局截图快捷键仅支持 macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use serde::Deserialize;
    use std::sync::Mutex;
    use std::{
        fs,
        io::{ErrorKind, Write},
        path::{Path, PathBuf},
    };
    use tauri::{Emitter, Manager};
    use tauri_plugin_global_shortcut::{GlobalShortcut, Modifiers, Shortcut, ShortcutState};

    struct NativeRegistrar<'a>(&'a tauri::AppHandle);

    impl ShortcutRegistrar for NativeRegistrar<'_> {
        fn register(&mut self, shortcut: Shortcut) -> Result<(), String> {
            self.0
                .try_state::<GlobalShortcut<tauri::Wry>>()
                .ok_or_else(|| "快捷键服务不可用，请重启应用".to_string())?
                .register(shortcut)
                .map_err(|error| format!("注册截图快捷键失败：{error}"))
        }
        fn unregister(&mut self, shortcut: Shortcut) -> Result<(), String> {
            self.0
                .try_state::<GlobalShortcut<tauri::Wry>>()
                .ok_or_else(|| "快捷键服务不可用，请重启应用".to_string())?
                .unregister(shortcut)
                .map_err(|error| format!("注销截图快捷键失败：{error}"))
        }
    }

    pub(super) fn initialize(app: &tauri::AppHandle) {
        let path = app
            .path()
            .app_data_dir()
            .map(|path| path.join("screenshot-shortcut-v1.json"))
            .map_err(|error| format!("读取快捷键设置目录失败：{error}"));
        let mut controller = ShortcutController::load(path);
        let plugin = tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if let Some(state) = app.try_state::<Mutex<ShortcutController>>() {
                    // The plugin holds its own shortcut lock while invoking this callback.
                    // Never wait for a concurrent rebind that needs that lock.
                    if let Ok(controller) = state.try_lock() {
                        if controller.active == Some(*shortcut) {
                            let _ = app.emit_to("main", "screenshot-shortcut", ());
                        }
                    }
                }
            })
            .build();
        match app.plugin(plugin) {
            Ok(()) => controller.start(&mut NativeRegistrar(app)),
            Err(error) => controller.settings.error = Some(format!("启动快捷键服务失败：{error}")),
        }
        app.manage(Mutex::new(controller));
    }

    pub(super) fn settings(app: &tauri::AppHandle) -> Result<ShortcutSettings, String> {
        let state = app.state::<Mutex<ShortcutController>>();
        let controller = state.lock().map_err(|_| "快捷键状态不可用".to_string())?;
        Ok(controller.settings.clone())
    }

    pub(super) fn configure(
        app: &tauri::AppHandle,
        enabled: bool,
        shortcut: String,
    ) -> Result<ShortcutSettings, String> {
        let state = app.state::<Mutex<ShortcutController>>();
        let mut controller = state.lock().map_err(|_| "快捷键状态不可用".to_string())?;
        controller.configure(&mut NativeRegistrar(app), enabled, shortcut)
    }

    fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
        let shortcut = value
            .parse::<Shortcut>()
            .map_err(|error| format!("快捷键格式无效：{error}"))?;
        if !shortcut
            .mods
            .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER)
        {
            return Err("快捷键必须包含 Control、Option 或 Command 修饰键".to_string());
        }
        Ok(shortcut)
    }

    #[derive(Deserialize, Serialize)]
    struct SavedShortcut {
        version: u8,
        enabled: bool,
        shortcut: String,
    }

    fn read_settings(path: &Path) -> Result<ShortcutSettings, String> {
        let contents = match fs::read(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return Ok(ShortcutSettings::default())
            }
            Err(error) => return Err(format!("读取截图快捷键设置失败：{error}")),
        };
        let saved: SavedShortcut = serde_json::from_slice(&contents)
            .map_err(|error| format!("解析截图快捷键设置失败：{error}"))?;
        if saved.version != 1 {
            return Err("截图快捷键设置版本不受支持".to_string());
        }
        Ok(ShortcutSettings {
            enabled: saved.enabled,
            shortcut: saved.shortcut,
            ..ShortcutSettings::default()
        })
    }

    fn write_settings(path: &Path, enabled: bool, shortcut: &str) -> Result<(), String> {
        let saved = SavedShortcut {
            version: 1,
            enabled,
            shortcut: shortcut.to_string(),
        };
        let contents = serde_json::to_vec(&saved).map_err(|error| error.to_string())?;
        let temporary_path = path.with_extension("tmp");
        let result = (|| -> Result<(), std::io::Error> {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut file = fs::File::create(&temporary_path)?;
            file.write_all(&contents)?;
            file.sync_all()?;
            fs::rename(&temporary_path, path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary_path);
        }
        result.map_err(|error| format!("保存截图快捷键设置失败：{error}"))
    }

    trait ShortcutRegistrar {
        fn register(&mut self, shortcut: Shortcut) -> Result<(), String>;
        fn unregister(&mut self, shortcut: Shortcut) -> Result<(), String>;
    }

    struct ShortcutController {
        settings: ShortcutSettings,
        active: Option<Shortcut>,
        path: Result<PathBuf, String>,
    }

    impl ShortcutController {
        fn load(path: Result<PathBuf, String>) -> Self {
            let settings = path
                .as_ref()
                .map_err(Clone::clone)
                .and_then(|path| read_settings(path));
            Self {
                settings: settings.unwrap_or_else(|error| ShortcutSettings {
                    error: Some(error),
                    ..ShortcutSettings::default()
                }),
                active: None,
                path,
            }
        }

        fn start(&mut self, registrar: &mut impl ShortcutRegistrar) {
            if !self.settings.enabled || self.settings.error.is_some() {
                return;
            }
            let registration = parse_shortcut(&self.settings.shortcut).and_then(|shortcut| {
                registrar
                    .register(shortcut)
                    .map_err(|error| format!("注册截图快捷键失败：{error}"))?;
                Ok(shortcut)
            });
            match registration {
                Ok(shortcut) => self.active = Some(shortcut),
                Err(error) => self.settings.error = Some(error),
            }
        }

        fn configure(
            &mut self,
            registrar: &mut impl ShortcutRegistrar,
            enabled: bool,
            shortcut: String,
        ) -> Result<ShortcutSettings, String> {
            let shortcut = shortcut.trim().to_string();
            let parsed = parse_shortcut(&shortcut)?;
            let next = enabled.then_some(parsed);
            let previous = self.active;
            if next != previous {
                if let Some(new) = next {
                    registrar.register(new)?;
                }
                if let Some(old) = previous {
                    if let Err(error) = registrar.unregister(old) {
                        return Err(self.rollback(registrar, previous, next, false, error));
                    }
                }
            }
            let saved = self
                .path
                .as_ref()
                .map_err(Clone::clone)
                .and_then(|path| write_settings(path, enabled, &shortcut));
            if let Err(error) = saved {
                return Err(self.rollback(registrar, previous, next, true, error));
            }
            self.active = next;
            self.settings.enabled = enabled;
            self.settings.shortcut = shortcut;
            self.settings.error = None;
            Ok(self.settings.clone())
        }

        fn rollback(
            &mut self,
            registrar: &mut impl ShortcutRegistrar,
            previous: Option<Shortcut>,
            next: Option<Shortcut>,
            removed_previous: bool,
            mut error: String,
        ) -> String {
            if previous == next {
                return error;
            }
            if removed_previous {
                self.active = None;
                if let Some(old) = previous {
                    match registrar.register(old) {
                        Ok(()) => self.active = Some(old),
                        Err(restore_error) => {
                            error.push_str(&format!("；恢复原快捷键失败：{restore_error}"));
                            self.settings.error = Some(error.clone());
                        }
                    }
                }
            }
            if let Some(new) = next {
                if let Err(remove_error) = registrar.unregister(new) {
                    error.push_str(&format!("；撤销新快捷键失败：{remove_error}"));
                    self.settings.error = Some(error.clone());
                }
            }
            error
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::{
            collections::HashSet,
            sync::atomic::{AtomicUsize, Ordering},
            time::{SystemTime, UNIX_EPOCH},
        };

        static NEXT_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

        #[derive(Default)]
        struct FakeRegistrar {
            registered: HashSet<Shortcut>,
            actions: Vec<(bool, Shortcut)>,
            fail_registration: Option<Shortcut>,
        }

        impl ShortcutRegistrar for FakeRegistrar {
            fn register(&mut self, shortcut: Shortcut) -> Result<(), String> {
                self.actions.push((true, shortcut));
                if self.fail_registration == Some(shortcut) {
                    return Err("already registered by another app".to_string());
                }
                if !self.registered.insert(shortcut) {
                    return Err("already registered locally".to_string());
                }
                Ok(())
            }

            fn unregister(&mut self, shortcut: Shortcut) -> Result<(), String> {
                self.actions.push((false, shortcut));
                self.registered.remove(&shortcut);
                Ok(())
            }
        }

        struct TestDirectory(PathBuf);

        impl TestDirectory {
            fn new() -> Self {
                let unique = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();
                let sequence = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
                Self(std::env::temp_dir().join(format!(
                    "fanyifanyi-shortcut-{}-{unique}-{sequence}",
                    std::process::id()
                )))
            }

            fn path(&self) -> PathBuf {
                self.0.join("screenshot-shortcut-v1.json")
            }
        }

        impl Drop for TestDirectory {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }

        #[test]
        fn registers_replacement_before_removing_the_previous_shortcut() {
            let directory = TestDirectory::new();
            let mut controller = ShortcutController::load(Ok(directory.path()));
            let mut registrar = FakeRegistrar::default();
            controller.start(&mut registrar);
            registrar.actions.clear();
            let old = DEFAULT_SHORTCUT.parse::<Shortcut>().unwrap();
            let new = "Ctrl+Alt+Y".parse::<Shortcut>().unwrap();

            let result = controller
                .configure(&mut registrar, true, "Ctrl+Alt+Y".to_string())
                .unwrap();

            assert_eq!(registrar.actions, vec![(true, new), (false, old)]);
            assert_eq!(registrar.registered, HashSet::from([new]));
            assert_eq!(result.shortcut, "Ctrl+Alt+Y");
            assert!(result.enabled);
        }

        #[test]
        fn keeps_previous_binding_and_saved_settings_when_replacement_registration_fails() {
            let directory = TestDirectory::new();
            let mut controller = ShortcutController::load(Ok(directory.path()));
            let mut registrar = FakeRegistrar::default();
            controller.start(&mut registrar);
            let previous = controller
                .configure(&mut registrar, true, DEFAULT_SHORTCUT.to_string())
                .unwrap();
            let original_file = fs::read(directory.path()).unwrap();
            let old = DEFAULT_SHORTCUT.parse::<Shortcut>().unwrap();
            let replacement = "Ctrl+Alt+Y".parse::<Shortcut>().unwrap();
            registrar.fail_registration = Some(replacement);
            registrar.actions.clear();

            let error = controller
                .configure(&mut registrar, true, "Ctrl+Alt+Y".to_string())
                .unwrap_err();

            assert!(error.contains("already registered by another app"));
            assert_eq!(registrar.actions, vec![(true, replacement)]);
            assert_eq!(registrar.registered, HashSet::from([old]));
            assert_eq!(controller.active, Some(old));
            assert_eq!(controller.settings, previous);
            assert_eq!(fs::read(directory.path()).unwrap(), original_file);
            assert_eq!(
                ShortcutController::load(Ok(directory.path())).settings,
                previous
            );
        }

        #[test]
        fn rejects_shortcuts_without_control_option_or_command_without_changing_settings() {
            let directory = TestDirectory::new();
            let mut controller = ShortcutController::load(Ok(directory.path()));
            let mut registrar = FakeRegistrar::default();
            controller.start(&mut registrar);
            let previous = controller
                .configure(&mut registrar, true, DEFAULT_SHORTCUT.to_string())
                .unwrap();
            let original_file = fs::read(directory.path()).unwrap();
            let old = DEFAULT_SHORTCUT.parse::<Shortcut>().unwrap();
            registrar.actions.clear();

            for shortcut in ["T", "Shift+T"] {
                let error = controller
                    .configure(&mut registrar, true, shortcut.to_string())
                    .unwrap_err();

                assert!(error.contains("Control、Option 或 Command 修饰键"));
                assert!(registrar.actions.is_empty());
                assert_eq!(registrar.registered, HashSet::from([old]));
                assert_eq!(controller.active, Some(old));
                assert_eq!(controller.settings, previous);
                assert_eq!(fs::read(directory.path()).unwrap(), original_file);
            }
        }

        #[test]
        fn keeps_disabled_custom_settings_after_restart() {
            let directory = TestDirectory::new();
            let mut controller = ShortcutController::load(Ok(directory.path()));
            let mut registrar = FakeRegistrar::default();
            controller.start(&mut registrar);

            controller
                .configure(&mut registrar, false, "Ctrl+Alt+Y".to_string())
                .unwrap();
            let mut reopened = ShortcutController::load(Ok(directory.path()));
            let mut restarted_registrar = FakeRegistrar::default();
            reopened.start(&mut restarted_registrar);

            assert!(!reopened.settings.enabled);
            assert_eq!(reopened.settings.shortcut, "Ctrl+Alt+Y");
            assert!(reopened.settings.error.is_none());
            assert!(registrar.registered.is_empty());
            assert!(restarted_registrar.registered.is_empty());
        }

        #[test]
        fn restores_previous_binding_and_file_when_saving_fails() {
            for (enabled, shortcut) in [(true, "Ctrl+Alt+Y"), (false, DEFAULT_SHORTCUT)] {
                let directory = TestDirectory::new();
                let mut controller = ShortcutController::load(Ok(directory.path()));
                let mut registrar = FakeRegistrar::default();
                controller.start(&mut registrar);
                let previous = controller
                    .configure(&mut registrar, true, DEFAULT_SHORTCUT.to_string())
                    .unwrap();
                fs::create_dir_all(directory.path().with_extension("tmp")).unwrap();

                let error = controller
                    .configure(&mut registrar, enabled, shortcut.to_string())
                    .unwrap_err();

                assert!(error.contains("保存截图快捷键设置失败"));
                assert_eq!(controller.settings, previous);
                assert_eq!(read_settings(&directory.path()).unwrap(), previous);
                assert_eq!(
                    registrar.registered,
                    HashSet::from([DEFAULT_SHORTCUT.parse::<Shortcut>().unwrap()])
                );
            }
        }

        #[test]
        fn reports_a_startup_conflict_and_can_retry_after_it_is_resolved() {
            let directory = TestDirectory::new();
            let mut controller = ShortcutController::load(Ok(directory.path()));
            let mut registrar = FakeRegistrar {
                fail_registration: Some(DEFAULT_SHORTCUT.parse::<Shortcut>().unwrap()),
                ..FakeRegistrar::default()
            };

            controller.start(&mut registrar);

            assert!(controller
                .settings
                .error
                .as_ref()
                .unwrap()
                .contains("already registered by another app"));
            assert!(controller.active.is_none());
            registrar.fail_registration = None;
            let saved = controller
                .configure(&mut registrar, true, DEFAULT_SHORTCUT.to_string())
                .unwrap();
            assert!(saved.error.is_none());
            assert!(controller.active.is_some());
        }
    }
}
