use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Default)]
pub(crate) struct ScreenshotStore {
    owners: Mutex<HashMap<PathBuf, String>>,
}

impl ScreenshotStore {
    pub(crate) fn register(
        &self,
        image_path: PathBuf,
        owner: &str,
        owner_exists: impl FnOnce() -> bool,
    ) -> Result<bool, String> {
        if !is_screenshot_temp_path(&image_path) {
            return Err("截图临时文件路径无效".to_string());
        }
        let mut owners = self
            .owners
            .lock()
            .map_err(|_| "截图临时文件状态锁已损坏".to_string())?;
        let owner_exists = owner_exists();
        owners.insert(image_path.clone(), owner.to_string());
        if !owner_exists {
            remove_screenshot_file(&image_path)?;
            owners.remove(&image_path);
        }
        Ok(owner_exists)
    }

    pub(crate) fn transfer(
        &self,
        image_path: &Path,
        owner: &str,
        target: &str,
        target_exists: impl FnOnce() -> bool,
    ) -> Result<bool, String> {
        if !is_screenshot_temp_path(image_path) {
            return Err("截图临时文件路径无效".to_string());
        }
        if !target.starts_with("screenshot-selection-")
            && !target.starts_with("translation-overlay-")
        {
            return Err("截图目标窗口无效".to_string());
        }
        let mut owners = self
            .owners
            .lock()
            .map_err(|_| "截图临时文件状态锁已损坏".to_string())?;
        if owners.get(image_path).map(String::as_str) != Some(owner) {
            return Err("截图已失效或不属于当前窗口".to_string());
        }
        // Window destruction uses the same lock, so it cannot race this handoff.
        if !target_exists() {
            return Ok(false);
        }
        owners.insert(image_path.to_path_buf(), target.to_string());
        Ok(true)
    }

    pub(crate) fn release(&self, image_path: &Path, owner: &str) -> Result<(), String> {
        if !is_screenshot_temp_path(image_path) {
            return Err("截图临时文件路径无效".to_string());
        }
        let mut owners = self
            .owners
            .lock()
            .map_err(|_| "截图临时文件状态锁已损坏".to_string())?;
        if owners.get(image_path).map(String::as_str) != Some(owner) {
            return Ok(());
        }
        remove_screenshot_file(image_path)?;
        owners.remove(image_path);
        Ok(())
    }

    pub(crate) fn release_window(&self, owner: &str) -> Result<(), String> {
        let mut owners = self
            .owners
            .lock()
            .map_err(|_| "截图临时文件状态锁已损坏".to_string())?;
        let mut first_error = None;
        owners.retain(|image_path, current_owner| {
            if owner != "main" && current_owner.as_str() != owner {
                return true;
            }
            match remove_screenshot_file(image_path) {
                Ok(()) => false,
                Err(error) => {
                    first_error.get_or_insert(error);
                    true
                }
            }
        });
        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

pub(crate) fn is_screenshot_temp_path(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    if !file_name.starts_with("fanyifanyi-screen-") || !file_name.ends_with(".png") {
        return false;
    }

    let Some(parent) = path.parent() else {
        return false;
    };
    match (parent.canonicalize(), std::env::temp_dir().canonicalize()) {
        (Ok(parent), Ok(temp_dir)) => parent == temp_dir,
        _ => parent == std::env::temp_dir(),
    }
}

fn remove_screenshot_file(image_path: &Path) -> Result<(), String> {
    match fs::remove_file(image_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => {
            let message = format!("删除截图临时文件失败: {}", error);
            log::warn!("{}: {}", message, image_path.display());
            Err(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::{
            atomic::{AtomicU64, Ordering},
            mpsc, Arc,
        },
        thread,
    };

    use super::ScreenshotStore;

    const SELECTION: &str = "screenshot-selection-test";
    const OVERLAY: &str = "translation-overlay-test";
    static NEXT_PATH: AtomicU64 = AtomicU64::new(0);

    fn screenshot_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "fanyifanyi-screen-store-test-{}-{}.png",
            std::process::id(),
            NEXT_PATH.fetch_add(1, Ordering::Relaxed)
        ))
    }

    fn screenshot_file() -> PathBuf {
        let path = screenshot_path();
        fs::write(&path, b"original screenshot").unwrap();
        path
    }

    #[test]
    fn keeps_the_original_after_handoff_and_old_owner_cleanup() {
        let store = ScreenshotStore::default();
        let path = screenshot_file();
        assert!(store.register(path.clone(), "main", || true).unwrap());
        assert!(store.transfer(&path, "main", SELECTION, || true).unwrap());
        assert!(store.transfer(&path, SELECTION, OVERLAY, || true).unwrap());

        store.release(&path, "main").unwrap();
        store.release(&path, SELECTION).unwrap();
        store.release_window(SELECTION).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"original screenshot");

        store.release_window(OVERLAY).unwrap();
        assert!(!path.exists());
        store.release_window(OVERLAY).unwrap();
        store.release(&path, OVERLAY).unwrap();
    }

    #[test]
    fn leaves_unregistered_screenshots_untouched() {
        let store = ScreenshotStore::default();
        let path = screenshot_file();

        store.release(&path, "main").unwrap();
        store.release_window("main").unwrap();
        assert!(path.exists());

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_invalid_paths_and_targets_without_releasing_the_original() {
        let store = ScreenshotStore::default();
        let path = screenshot_file();
        store.register(path.clone(), SELECTION, || true).unwrap();

        assert!(store.transfer(&path, "main", OVERLAY, || true).is_err());
        assert_eq!(
            store
                .transfer(&path, SELECTION, "settings", || true)
                .unwrap_err(),
            "截图目标窗口无效"
        );
        assert_eq!(
            store
                .release(&std::env::temp_dir().join("unrelated.png"), SELECTION)
                .unwrap_err(),
            "截图临时文件路径无效"
        );
        assert!(path.exists());

        store.release(&path, SELECTION).unwrap();
    }

    #[test]
    fn leaves_ownership_with_selection_when_the_target_is_gone() {
        let store = ScreenshotStore::default();
        let path = screenshot_file();
        store.register(path.clone(), SELECTION, || true).unwrap();
        store.release_window(OVERLAY).unwrap();

        assert!(!store.transfer(&path, SELECTION, OVERLAY, || false).unwrap());
        assert!(path.exists());
        store.release(&path, SELECTION).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn cannot_handoff_a_capture_after_the_source_is_destroyed() {
        let store = ScreenshotStore::default();
        let path = screenshot_file();
        store.register(path.clone(), SELECTION, || true).unwrap();
        store.release_window(SELECTION).unwrap();

        assert!(store.transfer(&path, SELECTION, OVERLAY, || true).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn target_destruction_waits_for_an_in_progress_handoff() {
        let store = Arc::new(ScreenshotStore::default());
        let path = screenshot_file();
        store.register(path.clone(), SELECTION, || true).unwrap();
        let (checked_tx, checked_rx) = mpsc::channel();
        let (continue_tx, continue_rx) = mpsc::channel();
        let transfer_store = Arc::clone(&store);
        let transfer_path = path.clone();
        let transfer = thread::spawn(move || {
            transfer_store.transfer(&transfer_path, SELECTION, OVERLAY, || {
                checked_tx.send(()).unwrap();
                continue_rx.recv().unwrap();
                true
            })
        });
        checked_rx.recv().unwrap();

        let destroy_store = Arc::clone(&store);
        let (destroying_tx, destroying_rx) = mpsc::channel();
        let destroy = thread::spawn(move || {
            destroying_tx.send(()).unwrap();
            destroy_store.release_window(OVERLAY)
        });
        destroying_rx.recv().unwrap();
        continue_tx.send(()).unwrap();

        assert!(transfer.join().unwrap().unwrap());
        destroy.join().unwrap().unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn deletes_a_new_capture_when_its_owner_has_already_closed() {
        let store = ScreenshotStore::default();
        let path = screenshot_file();
        store.release_window("main").unwrap();

        assert!(!store.register(path.clone(), "main", || false).unwrap());
        assert!(!path.exists());
    }

    #[test]
    fn closing_main_cleans_all_registered_windows() {
        let store = ScreenshotStore::default();
        let paths = [screenshot_file(), screenshot_file(), screenshot_file()];
        for (path, owner) in paths.iter().zip(["main", SELECTION, OVERLAY]) {
            store.register(path.clone(), owner, || true).unwrap();
        }

        store.release_window("main").unwrap();
        assert!(paths.iter().all(|path| !path.exists()));
        store.release_window("main").unwrap();
    }

    #[test]
    fn failed_window_cleanup_keeps_the_entry_and_cleans_other_files() {
        let store = ScreenshotStore::default();
        let blocked_path = screenshot_path();
        fs::create_dir(&blocked_path).unwrap();
        let other_path = screenshot_file();
        store
            .register(blocked_path.clone(), OVERLAY, || true)
            .unwrap();
        store
            .register(other_path.clone(), SELECTION, || true)
            .unwrap();

        assert!(store.release_window("main").is_err());
        assert!(blocked_path.exists());
        assert!(!other_path.exists());

        fs::remove_dir(&blocked_path).unwrap();
        fs::write(&blocked_path, b"original screenshot").unwrap();
        store.release_window("main").unwrap();
        assert!(!blocked_path.exists());
    }

    #[test]
    fn failed_release_keeps_ownership_for_a_later_retry() {
        let store = ScreenshotStore::default();
        let path = screenshot_path();
        fs::create_dir(&path).unwrap();
        store.register(path.clone(), SELECTION, || true).unwrap();

        assert!(store.release(&path, SELECTION).is_err());
        fs::remove_dir(&path).unwrap();
        fs::write(&path, b"original screenshot").unwrap();
        store.release(&path, SELECTION).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn failed_cleanup_of_a_closed_capture_owner_stays_registered() {
        let store = ScreenshotStore::default();
        let path = screenshot_path();
        fs::create_dir(&path).unwrap();

        assert!(store.register(path.clone(), "main", || false).is_err());
        fs::remove_dir(&path).unwrap();
        fs::write(&path, b"original screenshot").unwrap();
        store.release_window("main").unwrap();
        assert!(!path.exists());
    }
}
