use std::{
    collections::BTreeMap,
    fs,
    io::{ErrorKind, Write},
    path::PathBuf,
    sync::Mutex,
};

pub(crate) struct FileSecretStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl FileSecretStore {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    pub(crate) fn get(&self, key: &str) -> Result<Option<String>, String> {
        Self::validate_key(key)?;
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "本地安全存储锁已损坏".to_string())?;
        Ok(self.read()?.get(key).cloned())
    }

    pub(crate) fn set(&self, key: &str, value: &str) -> Result<(), String> {
        Self::validate_key(key)?;
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "本地安全存储锁已损坏".to_string())?;
        let mut secrets = self.read()?;
        secrets.insert(key.to_string(), value.to_string());
        self.write(&secrets)
    }

    pub(crate) fn remove(&self, key: &str) -> Result<(), String> {
        Self::validate_key(key)?;
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "本地安全存储锁已损坏".to_string())?;
        let mut secrets = self.read()?;
        if secrets.remove(key).is_none() {
            return Ok(());
        }
        if secrets.is_empty() {
            return match fs::remove_file(&self.path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("删除本地安全存储失败: {error}")),
            };
        }
        self.write(&secrets)
    }

    fn validate_key(key: &str) -> Result<(), String> {
        if key.trim().is_empty() {
            return Err("安全存储 key 不能为空".to_string());
        }
        Ok(())
    }

    fn read(&self) -> Result<BTreeMap<String, String>, String> {
        let contents = match fs::read(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(BTreeMap::new()),
            Err(error) => return Err(format!("读取本地安全存储失败: {error}")),
        };

        serde_json::from_slice(&contents).map_err(|error| format!("解析本地安全存储失败: {error}"))
    }

    fn write(&self, secrets: &BTreeMap<String, String>) -> Result<(), String> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "本地安全存储路径无效".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("创建本地安全存储目录失败: {error}"))?;
        let contents = serde_json::to_vec(secrets)
            .map_err(|error| format!("序列化本地安全存储失败: {error}"))?;

        let mut options = fs::OpenOptions::new();
        options.create(true).write(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        let mut file = options
            .open(&self.path)
            .map_err(|error| format!("打开本地安全存储失败: {error}"))?;
        file.write_all(&contents)
            .map_err(|error| format!("写入本地安全存储失败: {error}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.path, fs::Permissions::from_mode(0o600))
                .map_err(|error| format!("设置本地安全存储权限失败: {error}"))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::FileSecretStore;

    fn test_store() -> (FileSecretStore, std::path::PathBuf) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "fanyifanyi-secret-store-{}-{unique}.json",
            std::process::id()
        ));
        (FileSecretStore::new(path.clone()), path)
    }

    #[test]
    fn stores_and_reads_secret() {
        let (store, path) = test_store();

        store
            .set("ai-config:model:default-1:apiKey", "secret-value")
            .unwrap();
        drop(store);

        let reopened_store = FileSecretStore::new(path.clone());

        assert_eq!(
            reopened_store
                .get("ai-config:model:default-1:apiKey")
                .unwrap(),
            Some("secret-value".to_string())
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }

        if path.exists() {
            std::fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn removes_secret() {
        let (store, path) = test_store();
        store
            .set("sync:database_url", "postgresql://example")
            .unwrap();

        store.remove("sync:database_url").unwrap();

        assert_eq!(store.get("sync:database_url").unwrap(), None);
        if path.exists() {
            std::fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn rejects_empty_key() {
        let (store, path) = test_store();

        assert_eq!(
            store.set("  ", "secret-value").unwrap_err(),
            "安全存储 key 不能为空"
        );
        assert!(!path.exists());
    }
}
