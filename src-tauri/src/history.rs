use std::{
    fs,
    io::{ErrorKind, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryEntry {
    pub(crate) id: String,
    pub(crate) completed_at: u64,
    pub(crate) kind: HistoryKind,
    pub(crate) source_text: String,
    pub(crate) translated_text: String,
    pub(crate) engine: HistoryEngine,
    pub(crate) favorite: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HistoryKind {
    Desk,
    Screenshot,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryEngine {
    pub(crate) provider: HistoryProvider,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HistoryProvider {
    Ai,
    Google,
    Microsoft,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistorySnapshot {
    pub(crate) enabled: bool,
    pub(crate) entries: Vec<HistoryEntry>,
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
struct HistoryData {
    version: u32,
    #[serde(default = "default_enabled")]
    enabled: bool,
    entries: Vec<HistoryEntry>,
}

fn default_enabled() -> bool {
    true
}

impl Default for HistoryData {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: true,
            entries: Vec::new(),
        }
    }
}

impl HistoryData {
    fn prune(&mut self, now: u64) {
        let cutoff = now.saturating_sub(30 * 24 * 60 * 60 * 1000);
        self.entries
            .sort_by_key(|entry| std::cmp::Reverse(entry.completed_at));
        let mut ordinary_count = 0;
        self.entries.retain(|entry| {
            if entry.favorite {
                return true;
            }
            if entry.completed_at < cutoff {
                return false;
            }
            ordinary_count += 1;
            ordinary_count <= 500
        });
    }
}

pub(crate) struct HistoryStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl HistoryStore {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn get(&self, now: u64) -> Result<HistorySnapshot, String> {
        self.update(|data| data.prune(now))
    }

    fn record(&self, mut entry: HistoryEntry, now: u64) -> Result<(), String> {
        if entry.source_text.trim().is_empty() || entry.translated_text.trim().is_empty() {
            return Ok(());
        }
        entry.favorite = false;
        self.update(|data| {
            if !data.enabled {
                return;
            }
            if !data.entries.iter().any(|saved| saved.id == entry.id) {
                data.entries.push(entry);
            }
            data.prune(now);
        })
        .map(|_| ())
    }

    fn set_enabled(&self, enabled: bool) -> Result<HistorySnapshot, String> {
        self.update(|data| data.enabled = enabled)
    }

    fn set_favorite(&self, id: &str, favorite: bool, now: u64) -> Result<HistorySnapshot, String> {
        self.update(|data| {
            if let Some(entry) = data.entries.iter_mut().find(|entry| entry.id == id) {
                entry.favorite = favorite;
            }
            data.prune(now);
        })
    }

    fn delete(&self, id: &str, now: u64) -> Result<HistorySnapshot, String> {
        self.update(|data| {
            data.entries.retain(|entry| entry.id != id);
            data.prune(now);
        })
    }

    fn clear(&self) -> Result<HistorySnapshot, String> {
        self.update(|data| data.entries.retain(|entry| entry.favorite))
    }

    fn update(&self, change: impl FnOnce(&mut HistoryData)) -> Result<HistorySnapshot, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "历史记录存储锁已损坏".to_string())?;
        let mut data = self.read()?;
        let original = data.clone();
        change(&mut data);
        if data != original {
            self.write(&data)?;
        }
        Ok(HistorySnapshot {
            enabled: data.enabled,
            entries: data.entries,
        })
    }

    fn read(&self) -> Result<HistoryData, String> {
        let contents = match fs::read(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(HistoryData::default()),
            Err(error) => return Err(format!("读取历史记录失败: {error}")),
        };
        let data: HistoryData = serde_json::from_slice(&contents)
            .map_err(|error| format!("解析历史记录失败: {error}"))?;
        if data.version != 1 {
            return Err(format!("不支持的历史记录版本: {}", data.version));
        }
        Ok(data)
    }

    fn write(&self, data: &HistoryData) -> Result<(), String> {
        static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "历史记录存储路径无效".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("创建历史记录目录失败: {error}"))?;
        let contents =
            serde_json::to_vec(data).map_err(|error| format!("序列化历史记录失败: {error}"))?;
        let name = self
            .path
            .file_name()
            .ok_or_else(|| "历史记录存储路径无效".to_string())?;
        let temporary = parent.join(format!(
            ".{}.{}-{}.tmp",
            name.to_string_lossy(),
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|error| format!("创建历史记录临时文件失败: {error}"))?;
        let result = file.write_all(&contents).and_then(|_| file.sync_all());
        drop(file);
        let result = result.and_then(|_| fs::rename(&temporary, &self.path));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(|error| format!("保存历史记录失败: {error}"))
    }
}

fn now_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("读取系统时间失败: {error}"))
}

#[tauri::command]
pub(crate) fn history_get(
    store: tauri::State<'_, HistoryStore>,
) -> Result<HistorySnapshot, String> {
    store.get(now_millis()?)
}

#[tauri::command]
pub(crate) fn history_record(
    app: tauri::AppHandle,
    store: tauri::State<'_, HistoryStore>,
    entry: HistoryEntry,
    clipboard_session_id: Option<u64>,
) -> Result<(), String> {
    if let Some(id) = clipboard_session_id {
        return crate::clipboard_translation::with_current_session(&app, id, || {
            store.record(entry, now_millis()?)
        })
        .map(|_| ());
    }
    store.record(entry, now_millis()?)
}

#[tauri::command]
pub(crate) fn history_set_enabled(
    store: tauri::State<'_, HistoryStore>,
    enabled: bool,
) -> Result<HistorySnapshot, String> {
    store.set_enabled(enabled)
}

#[tauri::command]
pub(crate) fn history_set_favorite(
    store: tauri::State<'_, HistoryStore>,
    id: String,
    favorite: bool,
) -> Result<HistorySnapshot, String> {
    store.set_favorite(&id, favorite, now_millis()?)
}

#[tauri::command]
pub(crate) fn history_delete(
    store: tauri::State<'_, HistoryStore>,
    id: String,
) -> Result<HistorySnapshot, String> {
    store.delete(&id, now_millis()?)
}

#[tauri::command]
pub(crate) fn history_clear(
    store: tauri::State<'_, HistoryStore>,
) -> Result<HistorySnapshot, String> {
    store.clear()
}

#[cfg(test)]
mod tests {
    use std::{
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::*;

    const NOW: u64 = 1_800_000_000_000;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            static NEXT_ID: AtomicU64 = AtomicU64::new(0);
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "fanyifanyi-history-{}-{unique}-{}",
                std::process::id(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn store(&self) -> HistoryStore {
            HistoryStore::new(self.0.join("history-v1.json"))
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn entry(id: &str, completed_at: u64) -> HistoryEntry {
        HistoryEntry {
            id: id.to_string(),
            completed_at,
            kind: HistoryKind::Desk,
            source_text: "hello".to_string(),
            translated_text: "你好".to_string(),
            engine: HistoryEngine {
                provider: HistoryProvider::Ai,
                model_id: Some("model-1".to_string()),
                model_name: Some("Translation model".to_string()),
            },
            favorite: false,
        }
    }

    #[test]
    fn starts_enabled_and_keeps_entries_after_reopening() {
        let directory = TestDirectory::new();
        let store = directory.store();
        assert_eq!(
            store.get(NOW).unwrap(),
            HistorySnapshot {
                enabled: true,
                entries: vec![],
            }
        );

        let recorded = entry("first", NOW);
        store.record(recorded.clone(), NOW).unwrap();
        drop(store);

        assert_eq!(directory.store().get(NOW).unwrap().entries, vec![recorded]);
    }

    #[test]
    fn keeps_the_thirty_day_boundary_and_orders_by_completion_time() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let expired = entry("expired", NOW - 2_592_000_001);
        let boundary = entry("boundary", NOW - 2_592_000_000);
        let recent = entry("recent", NOW);
        for item in [&expired, &recent, &boundary] {
            store.record(item.clone(), item.completed_at).unwrap();
        }

        assert_eq!(store.get(NOW).unwrap().entries, vec![recent, boundary]);
        assert_eq!(directory.store().get(NOW).unwrap().entries.len(), 2);
    }

    #[test]
    fn keeps_favorites_outside_the_age_and_five_hundred_entry_limits() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let mut favorite = entry("favorite", NOW - 2_592_000_001);
        favorite.favorite = true;
        let mut entries = vec![favorite.clone()];
        entries.extend((0..502).map(|index| entry(&format!("item-{index}"), NOW - index)));
        fs::write(
            &store.path,
            serde_json::to_vec(&serde_json::json!({
                "version": 1,
                "enabled": true,
                "entries": entries,
            }))
            .unwrap(),
        )
        .unwrap();

        let snapshot = store.get(NOW).unwrap();

        assert_eq!(snapshot.entries.len(), 501);
        assert_eq!(snapshot.entries[0].id, "item-0");
        assert_eq!(snapshot.entries[499].id, "item-499");
        assert_eq!(snapshot.entries[500], favorite);
        assert_eq!(directory.store().get(NOW).unwrap(), snapshot);

        // A recent favorite also rejoins the 500-entry limit when unfavorited.
        let mut recent_favorite = entry("recent-favorite", NOW - 1000);
        recent_favorite.favorite = true;
        let mut entries = snapshot.entries;
        entries.push(recent_favorite);
        fs::write(
            &store.path,
            serde_json::to_vec(&serde_json::json!({
                "version": 1,
                "enabled": true,
                "entries": entries,
            }))
            .unwrap(),
        )
        .unwrap();
        let snapshot = store.set_favorite("recent-favorite", false, NOW).unwrap();
        assert_eq!(snapshot.entries.len(), 501);
        assert!(!snapshot
            .entries
            .iter()
            .any(|entry| entry.id == "recent-favorite"));
    }

    #[test]
    fn disabling_automatic_saving_preserves_entries_and_survives_reopening() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let old = entry("saved", NOW - 2_592_000_001);
        store.record(old.clone(), old.completed_at).unwrap();

        assert_eq!(
            store.set_enabled(false).unwrap(),
            HistorySnapshot {
                enabled: false,
                entries: vec![old.clone()],
            }
        );
        store.record(entry("ignored", NOW), NOW).unwrap();
        drop(store);
        let reopened = directory.store();
        assert!(!reopened.get(old.completed_at).unwrap().enabled);
        assert_eq!(reopened.get(old.completed_at).unwrap().entries, vec![old]);

        reopened.set_enabled(true).unwrap();
        let recent = entry("saved-again", NOW);
        reopened.record(recent.clone(), NOW).unwrap();
        assert_eq!(reopened.get(NOW).unwrap().entries, vec![recent]);
    }

    #[test]
    fn favoriting_survives_reopening_and_unfavoriting_applies_retention_immediately() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let old = entry("favorite", NOW - 2_592_000_001);
        store.record(old.clone(), old.completed_at).unwrap();
        let snapshot = store.set_favorite(&old.id, true, old.completed_at).unwrap();
        assert!(snapshot.entries[0].favorite);
        assert_eq!(directory.store().get(NOW).unwrap(), snapshot);

        assert!(store
            .set_favorite(&old.id, false, NOW)
            .unwrap()
            .entries
            .is_empty());
        assert!(directory.store().get(NOW).unwrap().entries.is_empty());
    }

    #[test]
    fn records_complete_text_once_and_preserves_the_original_favorite_and_timestamp() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let mut incomplete = entry("incomplete", NOW);
        incomplete.source_text = " \n\t".to_string();
        store.record(incomplete, NOW).unwrap();
        let mut incomplete = entry("incomplete", NOW);
        incomplete.translated_text = "  ".to_string();
        store.record(incomplete, NOW).unwrap();
        assert!(store.get(NOW).unwrap().entries.is_empty());

        let mut incoming = entry("unique", NOW);
        incoming.favorite = true;
        store.record(incoming, NOW).unwrap();
        assert!(!store.get(NOW).unwrap().entries[0].favorite);
        let original = store.set_favorite("unique", true, NOW).unwrap();

        let mut duplicate = entry("unique", NOW + 1000);
        duplicate.source_text = "different request text".to_string();
        store.record(duplicate, NOW + 1000).unwrap();
        assert_eq!(store.get(NOW + 1000).unwrap(), original);
        assert_eq!(directory.store().get(NOW + 1000).unwrap(), original);
    }

    #[test]
    fn clear_keeps_favorites_but_explicit_delete_can_remove_them() {
        let directory = TestDirectory::new();
        let store = directory.store();
        store.record(entry("ordinary", NOW), NOW).unwrap();
        store.record(entry("favorite", NOW + 1), NOW + 1).unwrap();
        store.set_favorite("favorite", true, NOW + 1).unwrap();
        store.set_enabled(false).unwrap();

        let snapshot = store.clear().unwrap();
        assert!(!snapshot.enabled);
        assert_eq!(snapshot.entries.len(), 1);
        assert_eq!(snapshot.entries[0].id, "favorite");
        assert_eq!(directory.store().get(NOW + 1).unwrap(), snapshot);
        assert!(store
            .delete("favorite", NOW + 1)
            .unwrap()
            .entries
            .is_empty());
        assert!(store.delete("missing", NOW + 1).unwrap().entries.is_empty());
        assert!(directory.store().get(NOW + 1).unwrap().entries.is_empty());
    }

    #[test]
    fn rejects_corrupt_or_unsupported_files_without_overwriting_them() {
        let directory = TestDirectory::new();
        let store = directory.store();
        for original in [
            "not json",
            r#"{"version":1,"entries":"broken"}"#,
            r#"{"enabled":true,"entries":[]}"#,
            r#"{"version":2,"enabled":true,"entries":[]}"#,
        ] {
            fs::write(&store.path, original).unwrap();
            assert!(store.get(NOW).is_err());
            assert!(store.record(entry("new", NOW), NOW).is_err());
            assert!(store.set_enabled(false).is_err());
            assert!(store.set_favorite("missing", true, NOW).is_err());
            assert!(store.delete("missing", NOW).is_err());
            assert!(store.clear().is_err());
            assert_eq!(fs::read_to_string(&store.path).unwrap(), original);
        }
    }

    #[test]
    fn concurrent_writers_do_not_lose_entries() {
        use std::sync::{Arc, Barrier};

        let directory = TestDirectory::new();
        let store = Arc::new(directory.store());
        let barrier = Arc::new(Barrier::new(8));
        let writers: Vec<_> = (0..8)
            .map(|writer| {
                let store = Arc::clone(&store);
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    for index in 0..20 {
                        store
                            .record(entry(&format!("{writer}-{index}"), NOW), NOW)
                            .unwrap();
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }

        let snapshot = directory.store().get(NOW).unwrap();
        let ids: std::collections::HashSet<_> = snapshot
            .entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect();
        assert_eq!(snapshot.entries.len(), 160);
        for writer in 0..8 {
            for index in 0..20 {
                assert!(ids.contains(format!("{writer}-{index}").as_str()));
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn failed_atomic_write_preserves_the_original_file() {
        let directory = TestDirectory::new();
        // A valid 250-byte filename leaves no room for the temporary-file suffix.
        let store = HistoryStore::new(directory.0.join(format!("{}.json", "h".repeat(245))));
        let saved = entry("saved", NOW);
        let original = serde_json::to_vec(&serde_json::json!({
            "version": 1,
            "enabled": true,
            "entries": [saved.clone()],
        }))
        .unwrap();
        fs::write(&store.path, &original).unwrap();

        assert!(store.record(entry("new", NOW), NOW).is_err());
        assert!(store.set_enabled(false).is_err());
        assert_eq!(fs::read(&store.path).unwrap(), original);
        assert_eq!(store.get(NOW).unwrap().entries, vec![saved]);
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[test]
    fn persists_the_versioned_camel_case_contract_and_defaults_enabled() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::write(&store.path, r#"{"version":1,"entries":[]}"#).unwrap();
        assert!(store.get(NOW).unwrap().enabled);
        store.record(entry("contract", NOW), NOW).unwrap();

        let json: serde_json::Value =
            serde_json::from_slice(&fs::read(&store.path).unwrap()).unwrap();
        assert_eq!(json["version"], 1);
        assert_eq!(json["enabled"], true);
        assert_eq!(json["entries"][0]["completedAt"], NOW);
        assert_eq!(json["entries"][0]["sourceText"], "hello");
        assert_eq!(json["entries"][0]["translatedText"], "你好");
        assert_eq!(json["entries"][0]["kind"], "desk");
        assert_eq!(json["entries"][0]["engine"]["provider"], "ai");
        assert_eq!(json["entries"][0]["engine"]["modelId"], "model-1");
        assert_eq!(
            json["entries"][0]["engine"]["modelName"],
            "Translation model"
        );
        assert!(serde_json::to_value(store.get(NOW).unwrap())
            .unwrap()
            .get("version")
            .is_none());
    }
}
