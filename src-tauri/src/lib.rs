use std::{error::Error as StdError, path::Path, sync::Arc, time::Duration};

use keyring::{Entry, Error as KeyringError};
use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, ServerName, UnixTime},
    DigitallySignedStruct, Error as TlsError, SignatureScheme,
};
use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest;
use tauri_plugin_log::{Target, TargetKind};
use tokio_postgres::{config::SslMode, Client, Config};
use tokio_postgres_rustls::MakeRustlsConnect;
use url::Url;

const KEYRING_SERVICE: &str = "com.fanyifanyi.app";
const SYNC_DATABASE_URL_KEY: &str = "sync:database_url";
const SYNC_DATABASE_ACCEPT_INVALID_TLS_PARAM: &str = "sslaccept";
const SYNC_DATABASE_ACCEPT_INVALID_TLS_VALUE: &str = "invalid";
const MICROSOFT_TRANSLATOR_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncDatabaseStatus {
    configured: bool,
    preview: Option<String>,
}

#[derive(Debug, Serialize)]
struct SyncRow {
    schema_version: i32,
    revision: String,
    updated_at: String,
    device_id: String,
    plaintext: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncPayloadPlaintext {
    schema_version: i32,
    revision: String,
    device_id: String,
    updated_at: String,
    active_model_id: String,
    translation_provider: String,
    models: serde_json::Value,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn ensure_keyring_store() -> Result<(), String> {
    Ok(())
}

fn secure_entry(key: &str) -> Result<Entry, String> {
    if key.trim().is_empty() {
        return Err("安全存储 key 不能为空".to_string());
    }

    ensure_keyring_store()?;
    Entry::new(KEYRING_SERVICE, key).map_err(|error| format!("打开安全存储失败: {:?}", error))
}

#[tauri::command]
fn secure_storage_get(key: String) -> Result<Option<String>, String> {
    let entry = secure_entry(&key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("读取安全存储失败: {:?}", error)),
    }
}

#[tauri::command]
fn secure_storage_set(key: String, value: String) -> Result<(), String> {
    let entry = secure_entry(&key)?;
    entry
        .set_password(&value)
        .map_err(|error| format!("写入安全存储失败: {:?}", error))
}

#[tauri::command]
fn secure_storage_remove(key: String) -> Result<(), String> {
    let entry = secure_entry(&key)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除安全存储失败: {:?}", error)),
    }
}

fn decode_url_component(value: &str) -> Result<String, String> {
    urlencoding::decode(value)
        .map(|decoded| decoded.into_owned())
        .map_err(|_| "Supabase 连接池 URL 包含无效转义字符".to_string())
}

fn is_supabase_database_host(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    normalized.ends_with(".pooler.supabase.com") || normalized.ends_with(".supabase.co")
}

fn database_config_from_url(database_url: &str) -> Result<Config, String> {
    let parsed =
        Url::parse(database_url).map_err(|_| "Supabase 连接池 URL 格式无效".to_string())?;
    if parsed.scheme() != "postgres" && parsed.scheme() != "postgresql" {
        return Err("Supabase 连接池 URL 必须以 postgres:// 或 postgresql:// 开头".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Supabase 连接池 URL 缺少主机名".to_string())?;
    if !is_supabase_database_host(host) {
        return Err(format!(
            "Supabase 连接池 URL 的主机名看起来不正确（{}）。请从 Supabase Dashboard 复制完整的 Connection pooler URI；如果密码里有 @、/、#、? 等字符，不要手动拼接 URL",
            host
        ));
    }

    if parsed.username().is_empty() {
        return Err("Supabase 连接池 URL 缺少用户名".to_string());
    }
    if parsed.password().is_none() {
        return Err("Supabase 连接池 URL 缺少密码".to_string());
    }
    if parsed.username().contains('/') || parsed.password().unwrap_or_default().contains('/') {
        return Err(
            "Supabase 连接池 URL 的用户名或密码包含未编码的 /，请使用 Supabase 复制的 URI"
                .to_string(),
        );
    }
    if parsed
        .query_pairs()
        .any(|(key, value)| key == "sslmode" && value == "disable")
    {
        return Err("Supabase 连接池 URL 必须使用 TLS".to_string());
    }

    let database = parsed.path().trim_start_matches('/');
    let database = if database.is_empty() {
        "postgres"
    } else {
        database
    };

    let mut config = Config::new();
    config.host(host);
    config.port(parsed.port().unwrap_or(5432));
    config.user(decode_url_component(parsed.username())?);
    config.password(decode_url_component(parsed.password().unwrap_or_default())?);
    config.dbname(decode_url_component(database)?);
    config.connect_timeout(Duration::from_secs(15));
    config.ssl_mode(SslMode::Require);

    Ok(config)
}

fn sync_database_accepts_invalid_tls(database_url: &str) -> bool {
    Url::parse(database_url)
        .ok()
        .map(|parsed| {
            parsed.query_pairs().any(|(key, value)| {
                key == SYNC_DATABASE_ACCEPT_INVALID_TLS_PARAM
                    && value.eq_ignore_ascii_case(SYNC_DATABASE_ACCEPT_INVALID_TLS_VALUE)
            })
        })
        .unwrap_or(false)
}

fn validate_database_url(database_url: &str) -> Result<String, String> {
    let trimmed = database_url.trim();
    if trimmed.is_empty() {
        return Err("请粘贴 Supabase 连接池 URL".to_string());
    }

    database_config_from_url(trimmed)?;
    Ok(trimmed.to_string())
}

fn database_url_preview(database_url: &str) -> Option<String> {
    let parsed = Url::parse(database_url).ok()?;
    let host = parsed.host_str()?;
    let port = parsed
        .port()
        .map(|port| format!(":{}", port))
        .unwrap_or_default();
    let database = parsed.path().trim_start_matches('/');
    let database = if database.is_empty() {
        "postgres"
    } else {
        database
    };
    let user = if parsed.username().is_empty() {
        String::new()
    } else {
        format!("{}:****@", parsed.username())
    };

    Some(format!("{}{}{}/{}", user, host, port, database))
}

fn sync_database_status_from_url(database_url: Option<&str>) -> SyncDatabaseStatus {
    SyncDatabaseStatus {
        configured: database_url.is_some(),
        preview: database_url.and_then(database_url_preview),
    }
}

fn stored_sync_database_url() -> Result<String, String> {
    secure_storage_get(SYNC_DATABASE_URL_KEY.to_string())?
        .ok_or_else(|| "请先保存 Supabase 连接池 URL".to_string())
}

fn redact_sensitive_database_text(message: &str, database_url: &str) -> String {
    let mut redacted = message.replace(database_url, "[database-url-redacted]");

    if let Ok(parsed) = Url::parse(database_url) {
        if let Some(password) = parsed.password().filter(|password| !password.is_empty()) {
            if password.len() >= 4 {
                redacted = redacted.replace(password, "[password-redacted]");
            }
            if let Ok(decoded_password) = decode_url_component(password) {
                if decoded_password.len() >= 4 {
                    redacted = redacted.replace(&decoded_password, "[password-redacted]");
                }
            }
        }
    }

    redacted
}

fn redact_database_error(error: &(dyn StdError + 'static), database_url: &str) -> String {
    let mut messages = Vec::new();
    let mut current = Some(error);

    while let Some(error) = current {
        let message = redact_sensitive_database_text(&error.to_string(), database_url);
        if !message.trim().is_empty() && !messages.contains(&message) {
            messages.push(message);
        }
        current = error.source();
    }

    messages.join(": ")
}

fn database_connection_error_message(
    error: &(dyn StdError + 'static),
    database_url: &str,
) -> String {
    let target =
        database_url_preview(database_url).unwrap_or_else(|| "Supabase 数据库".to_string());
    let details = redact_database_error(error, database_url);
    let help = if details.contains("UnknownIssuer") {
        "。推荐在 Supabase Dashboard 下载 Server root certificate，并在连接 URL 末尾追加 ?sslrootcert=/path/to/certificate.pem；也可以在同步设置中开启跳过证书校验"
    } else {
        ""
    };

    format!(
        "连接 Supabase 数据库失败（{}）: {}{}",
        target, details, help
    )
}

fn load_explicit_database_root_cert(
    roots: &mut rustls::RootCertStore,
    cert_path: &Path,
) -> Result<(), String> {
    let cert_result = rustls_native_certs::load_certs_from_paths(Some(cert_path), None);
    if !cert_result.errors.is_empty() {
        return Err(format!(
            "读取 Supabase CA 证书失败（{}）: {:?}",
            cert_path.display(),
            cert_result.errors
        ));
    }
    if cert_result.certs.is_empty() {
        return Err(format!(
            "Supabase CA 证书文件为空或格式无效（{}）",
            cert_path.display()
        ));
    }

    let (valid_count, invalid_count) = roots.add_parsable_certificates(cert_result.certs);
    if valid_count == 0 {
        return Err(format!(
            "Supabase CA 证书文件格式无效（{}）",
            cert_path.display()
        ));
    }
    if invalid_count > 0 {
        log::debug!(
            "Supabase CA 证书中有无法解析的条目: path={}, invalid={}",
            cert_path.display(),
            invalid_count
        );
    }

    Ok(())
}

fn sync_database_root_cert_store(database_url: &str) -> Result<rustls::RootCertStore, String> {
    let mut roots = rustls::RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    let native_certs = rustls_native_certs::load_native_certs();

    if !native_certs.errors.is_empty() {
        log::debug!(
            "加载系统数据库 TLS 根证书时遇到错误: {:?}",
            native_certs.errors
        );
    }
    if !native_certs.certs.is_empty() {
        let (valid_count, invalid_count) = roots.add_parsable_certificates(native_certs.certs);
        log::debug!(
            "已加载系统数据库 TLS 根证书: valid={}, invalid={}",
            valid_count,
            invalid_count
        );
    }

    if let Some(cert_path) = Url::parse(database_url)
        .ok()
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "sslrootcert")
                .map(|(_, value)| value.into_owned())
        })
        .filter(|value| !value.trim().is_empty())
    {
        load_explicit_database_root_cert(&mut roots, Path::new(&cert_path))?;
    }

    Ok(roots)
}

#[derive(Debug)]
struct AcceptInvalidDatabaseTlsVerifier;

impl ServerCertVerifier for AcceptInvalidDatabaseTlsVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA1,
            SignatureScheme::ECDSA_SHA1_Legacy,
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
            SignatureScheme::ECDSA_NISTP521_SHA512,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::ED25519,
            SignatureScheme::ED448,
        ]
    }
}

fn sync_database_tls_config(database_url: &str) -> Result<rustls::ClientConfig, String> {
    let mut tls_config = rustls::ClientConfig::builder_with_provider(
        rustls::crypto::ring::default_provider().into(),
    )
    .with_safe_default_protocol_versions()
    .map_err(|error| format!("创建数据库 TLS 连接器失败: {}", error))?
    .with_root_certificates(sync_database_root_cert_store(database_url)?)
    .with_no_client_auth();

    if sync_database_accepts_invalid_tls(database_url) {
        log::warn!("同步数据库连接已启用跳过 TLS 证书校验");
        tls_config
            .dangerous()
            .set_certificate_verifier(Arc::new(AcceptInvalidDatabaseTlsVerifier));
    }

    Ok(tls_config)
}

async fn connect_sync_database(database_url: &str) -> Result<Client, String> {
    let config = database_config_from_url(database_url)?;
    let tls = MakeRustlsConnect::new(sync_database_tls_config(database_url)?);
    let (client, connection) = config
        .connect(tls)
        .await
        .map_err(|error| database_connection_error_message(&error, database_url))?;

    tauri::async_runtime::spawn(async move {
        if let Err(error) = connection.await {
            log::debug!("同步数据库连接已关闭: {}", error);
        }
    });

    Ok(client)
}

async fn ensure_sync_schema(client: &Client) -> Result<(), String> {
    client
        .batch_execute(
            "
            create table if not exists public.fanyifanyi_ai_configs (
              key text primary key,
              schema_version integer not null,
              revision text not null,
              updated_at timestamptz not null,
              device_id text not null,
              plaintext jsonb not null,
              created_at timestamptz not null default now()
            );
            ",
        )
        .await
        .map_err(|error| format!("初始化同步表失败: {}", error))
}

fn validate_sync_payload(payload: &SyncPayloadPlaintext) -> Result<(), String> {
    if payload.schema_version != 1 {
        return Err("同步配置版本无效".to_string());
    }
    if payload.revision.trim().is_empty() || payload.device_id.trim().is_empty() {
        return Err("同步配置缺少版本信息".to_string());
    }
    if payload.updated_at.trim().is_empty() {
        return Err("同步配置缺少更新时间".to_string());
    }
    if payload.active_model_id.trim().is_empty() {
        return Err("同步配置缺少当前模型".to_string());
    }
    if !matches!(
        payload.translation_provider.as_str(),
        "ai" | "google" | "microsoft"
    ) {
        return Err("同步配置翻译方式无效".to_string());
    }
    if !payload
        .models
        .as_array()
        .map(|models| !models.is_empty())
        .unwrap_or(false)
    {
        return Err("同步配置缺少模型列表".to_string());
    }

    Ok(())
}

fn sync_upload_config_sql() -> &'static str {
    "
            insert into public.fanyifanyi_ai_configs
              (key, schema_version, revision, updated_at, device_id, plaintext)
            values
              ('default', $1, $2, $3::text::timestamptz, $4, $5::jsonb)
            on conflict (key) do update set
              schema_version = excluded.schema_version,
              revision = excluded.revision,
              updated_at = excluded.updated_at,
              device_id = excluded.device_id,
              plaintext = excluded.plaintext
            "
}

#[tauri::command]
fn sync_database_status() -> Result<SyncDatabaseStatus, String> {
    Ok(sync_database_status_from_url(
        secure_storage_get(SYNC_DATABASE_URL_KEY.to_string())?.as_deref(),
    ))
}

#[tauri::command]
async fn sync_database_save_url(database_url: String) -> Result<SyncDatabaseStatus, String> {
    let database_url = validate_database_url(&database_url)?;
    let client = connect_sync_database(&database_url).await?;
    ensure_sync_schema(&client).await?;
    secure_storage_set(SYNC_DATABASE_URL_KEY.to_string(), database_url.clone())?;
    Ok(sync_database_status_from_url(Some(&database_url)))
}

#[tauri::command]
fn sync_database_clear() -> Result<(), String> {
    secure_storage_remove(SYNC_DATABASE_URL_KEY.to_string())
}

#[tauri::command]
async fn sync_fetch_config() -> Result<Option<SyncRow>, String> {
    let database_url = stored_sync_database_url()?;
    let client = connect_sync_database(&database_url).await?;
    ensure_sync_schema(&client).await?;

    let row = client
        .query_opt(
            "
            select
              schema_version,
              revision,
              coalesce(
                plaintext->>'updatedAt',
                to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')
              ),
              device_id,
              plaintext
            from public.fanyifanyi_ai_configs
            where key = 'default'
            ",
            &[],
        )
        .await
        .map_err(|error| format!("读取云端配置失败: {}", error))?;

    Ok(row.map(|row| SyncRow {
        schema_version: row.get(0),
        revision: row.get(1),
        updated_at: row.get(2),
        device_id: row.get(3),
        plaintext: row.get(4),
    }))
}

#[tauri::command]
async fn sync_upload_config(payload: SyncPayloadPlaintext) -> Result<(), String> {
    validate_sync_payload(&payload)?;
    let database_url = stored_sync_database_url()?;
    let client = connect_sync_database(&database_url).await?;
    ensure_sync_schema(&client).await?;
    let plaintext =
        serde_json::to_value(&payload).map_err(|error| format!("序列化同步配置失败: {}", error))?;

    client
        .execute(
            sync_upload_config_sql(),
            &[
                &payload.schema_version,
                &payload.revision,
                &payload.updated_at,
                &payload.device_id,
                &plaintext,
            ],
        )
        .await
        .map_err(|error| format!("上传配置失败: {}", error))?;

    Ok(())
}

#[tauri::command]
async fn get_dict_data(q: String) -> Result<serde_json::Value, String> {
    let dicts = serde_json::json!({
        "count": 99,
        "dicts": [["simple", "phrs", "syno", "ec", "rel_word"]]
    });

    let url = format!(
        "https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q={}&dicts={}",
        urlencoding::encode(&q),
        urlencoding::encode(&dicts.to_string())
    );

    let response = match reqwest::get(&url).await {
        Ok(resp) => resp,
        Err(e) => {
            log::error!("词典 API 请求失败 (网络错误): {}", e);
            return Err(format!("网络请求失败: {}", e));
        }
    };

    let text = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            log::error!("词典 API 请求失败 (读取响应): {}", e);
            return Err(format!("读取响应失败: {}", e));
        }
    };

    let json: serde_json::Value = match serde_json::from_str(&text) {
        Ok(j) => j,
        Err(e) => {
            log::error!("词典 API 请求失败 (解析 JSON): {}", e);
            return Err(format!("解析响应失败: {}", e));
        }
    };

    Ok(json)
}

fn response_detail(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(message) = json
            .pointer("/error/message")
            .and_then(|value| value.as_str())
            .or_else(|| json.get("message").and_then(|value| value.as_str()))
        {
            return message.to_string();
        }
    }

    trimmed.chars().take(300).collect()
}

fn ai_test_status_error(status: u16, body: &str) -> String {
    let detail = response_detail(body);
    let prefix = match status {
        400 => "请求被服务商拒绝，请检查模型标识和 API Base URL",
        401 | 403 => "认证失败，请检查 API Key 是否正确或是否有该模型权限",
        404 => "接口不存在，请检查 API Base URL 是否应以 /v1 结尾",
        429 => "请求被限流或额度不足，请稍后重试或检查账户余额",
        500..=599 => "服务商接口暂时不可用，请稍后重试",
        _ => "模型测试失败",
    };

    if detail.is_empty() {
        format!("{}（HTTP {}）", prefix, status)
    } else {
        format!("{}（HTTP {}）：{}", prefix, status, detail)
    }
}

fn normalize_openai_base_url(base_url: &str) -> String {
    let mut normalized = base_url.trim().trim_end_matches('/').to_string();
    let lower = normalized.to_ascii_lowercase();

    if lower.ends_with("/chat/completions") {
        let new_len = normalized.len() - "/chat/completions".len();
        normalized.truncate(new_len);
        normalized = normalized.trim_end_matches('/').to_string();
    }

    normalized
}

fn translate_prompt(text: &str) -> String {
    format!(
        "你的任务是自动判断待翻译文本的语言并进行中英互译。若待翻译文本为中文，则将其翻译成英文；若待翻译文本为英文，则将其翻译成中文。请仔细阅读以下信息，并完成翻译。\n\n\
待翻译文本:\n\
<text>\n\
{}\n\
</text>\n\n\
在进行翻译时，请遵循以下指南:\n\
1. 确保翻译准确传达原文的意思。\n\
2. 尽量使用自然、流畅的表达方式。\n\
3. 注意语法和拼写的正确性。\n\n\
请直接输出翻译结果，不需要添加任何标签或说明。",
        text
    )
}

fn contains_cjk(text: &str) -> bool {
    text.chars().any(|ch| {
        matches!(
            ch as u32,
            0x3400..=0x4DBF
                | 0x4E00..=0x9FFF
                | 0xF900..=0xFAFF
                | 0x20000..=0x2A6DF
                | 0x2A700..=0x2B73F
                | 0x2B740..=0x2B81F
                | 0x2B820..=0x2CEAF
        )
    })
}

fn google_target_language(text: &str) -> &'static str {
    if contains_cjk(text) {
        "en"
    } else {
        "zh-CN"
    }
}

fn parse_google_translation(response_text: &str) -> Result<String, String> {
    let json: serde_json::Value = serde_json::from_str(response_text)
        .map_err(|error| format!("解析 Google 翻译响应失败: {}", error))?;

    let translated_parts = json
        .get("sentences")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Google 翻译响应缺少 sentences".to_string())?
        .iter()
        .filter_map(|item| item.get("trans").and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if translated_parts.is_empty() {
        return Err("Google 翻译响应缺少 sentences[].trans".to_string());
    }

    Ok(translated_parts.join(" "))
}

fn parse_microsoft_translation(response_text: &str) -> Result<String, String> {
    let json: serde_json::Value = serde_json::from_str(response_text)
        .map_err(|error| format!("解析 Microsoft 翻译响应失败: {}", error))?;

    let translated_parts = json
        .as_array()
        .ok_or_else(|| "Microsoft 翻译响应格式无效".to_string())?
        .iter()
        .flat_map(|item| {
            item.get("translations")
                .and_then(|value| value.as_array())
                .into_iter()
                .flatten()
        })
        .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if translated_parts.is_empty() {
        return Err("Microsoft 翻译响应缺少 translations[].text".to_string());
    }

    Ok(translated_parts.join(" "))
}

fn validate_microsoft_token(token: &str) -> Result<(), String> {
    if token.split('.').count() == 3 {
        return Ok(());
    }

    Err("Microsoft 翻译 token 格式无效".to_string())
}

fn validate_ai_request_config(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<(String, String, String), String> {
    let base_url = normalize_openai_base_url(&base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();

    if base_url.is_empty() {
        return Err("请填写 API Base URL".to_string());
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err("API Base URL 必须以 http:// 或 https:// 开头".to_string());
    }
    if api_key.is_empty() {
        return Err("请先填写 API Key".to_string());
    }
    if model.is_empty() {
        return Err("请填写模型标识".to_string());
    }

    Ok((base_url, api_key, model))
}

#[tauri::command]
async fn test_ai_config(base_url: String, api_key: String, model: String) -> Result<(), String> {
    let (base_url, api_key, model) = validate_ai_request_config(base_url, api_key, model)?;

    let url = format!("{}/chat/completions", base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("创建测试客户端失败: {}", error))?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 8,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": "Reply with OK."
            }
        ]
    })
    .to_string();

    let response = client
        .post(&url)
        .bearer_auth(&api_key)
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "测试超时，请检查网络连接或 API Base URL".to_string()
            } else if error.is_connect() {
                format!(
                    "连接失败：无法访问 API Base URL，请检查地址、网络或代理设置。原始错误：{}",
                    error
                )
            } else {
                format!("发送测试请求失败: {}", error)
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(ai_test_status_error(status.as_u16(), &body));
    }

    Ok(())
}

#[tauri::command]
async fn translate_text(
    base_url: String,
    api_key: String,
    model: String,
    text: String,
) -> Result<String, String> {
    let (base_url, api_key, model) = validate_ai_request_config(base_url, api_key, model)?;
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let url = format!("{}/chat/completions", base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("创建翻译客户端失败: {}", error))?;

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": translate_prompt(&text)
            }
        ]
    })
    .to_string();

    let response = client
        .post(&url)
        .bearer_auth(&api_key)
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "翻译超时，请检查网络连接或 API Base URL".to_string()
            } else if error.is_connect() {
                format!(
                    "连接失败：无法访问 API Base URL，请检查地址、网络或代理设置。原始错误：{}",
                    error
                )
            } else {
                format!("发送翻译请求失败: {}", error)
            }
        })?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("读取翻译响应失败: {}", error))?;

    if !status.is_success() {
        return Err(ai_test_status_error(status.as_u16(), &response_text));
    }

    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|error| format!("解析翻译响应失败: {}", error))?;

    let content = json
        .pointer("/choices/0/message/content")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "翻译响应缺少 choices[0].message.content".to_string())?;

    Ok(content.to_string())
}

#[tauri::command]
async fn translate_with_google(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let target_language = google_target_language(&text);
    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1&ie=UTF-8&sl=auto&tl={}&q={}",
        target_language,
        urlencoding::encode(&text)
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("创建 Google 翻译客户端失败: {}", error))?;

    let response = client
        .get(&url)
        .header("content-type", "application/json")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Google 翻译超时，请检查网络连接".to_string()
            } else if error.is_connect() {
                format!(
                    "连接 Google 翻译失败，请检查网络或代理设置。原始错误：{}",
                    error
                )
            } else {
                format!("发送 Google 翻译请求失败: {}", error)
            }
        })?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("读取 Google 翻译响应失败: {}", error))?;

    if !status.is_success() {
        let detail = response_detail(&response_text);
        if detail.is_empty() {
            return Err(format!("Google 翻译请求失败（HTTP {}）", status.as_u16()));
        }
        return Err(format!(
            "Google 翻译请求失败（HTTP {}）：{}",
            status.as_u16(),
            detail
        ));
    }

    parse_google_translation(&response_text)
}

#[tauri::command]
async fn translate_with_microsoft(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("创建 Microsoft 翻译客户端失败: {}", error))?;

    let auth_response = client
        .get("https://edge.microsoft.com/translate/auth")
        .header("user-agent", MICROSOFT_TRANSLATOR_USER_AGENT)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "获取 Microsoft 翻译 token 超时，请检查网络连接".to_string()
            } else if error.is_connect() {
                format!(
                    "连接 Microsoft 翻译 token 服务失败，请检查网络或代理设置。原始错误：{}",
                    error
                )
            } else {
                format!("获取 Microsoft 翻译 token 失败: {}", error)
            }
        })?;

    let auth_status = auth_response.status();
    let token = auth_response
        .text()
        .await
        .map_err(|error| format!("读取 Microsoft 翻译 token 失败: {}", error))?;

    if !auth_status.is_success() {
        let detail = response_detail(&token);
        if detail.is_empty() {
            return Err(format!(
                "获取 Microsoft 翻译 token 失败（HTTP {}）",
                auth_status.as_u16()
            ));
        }
        return Err(format!(
            "获取 Microsoft 翻译 token 失败（HTTP {}）：{}",
            auth_status.as_u16(),
            detail
        ));
    }

    let token = token.trim();
    if token.is_empty() {
        return Err("Microsoft 翻译 token 为空".to_string());
    }
    validate_microsoft_token(token)?;

    let target_language = google_target_language(&text);
    let url = format!(
        "https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&to={}",
        target_language
    );
    let body = serde_json::json!([{ "Text": text }]).to_string();

    let response = client
        .post(&url)
        .bearer_auth(token)
        .header("content-type", "application/json")
        .header("user-agent", MICROSOFT_TRANSLATOR_USER_AGENT)
        .header("ocp-apim-subscription-region", "global")
        .body(body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Microsoft 翻译超时，请检查网络连接".to_string()
            } else if error.is_connect() {
                format!(
                    "连接 Microsoft 翻译失败，请检查网络或代理设置。原始错误：{}",
                    error
                )
            } else {
                format!("发送 Microsoft 翻译请求失败: {}", error)
            }
        })?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("读取 Microsoft 翻译响应失败: {}", error))?;

    if !status.is_success() {
        let detail = response_detail(&response_text);
        if detail.is_empty() {
            return Err(format!(
                "Microsoft 翻译请求失败（HTTP {}）",
                status.as_u16()
            ));
        }
        return Err(format!(
            "Microsoft 翻译请求失败（HTTP {}）：{}",
            status.as_u16(),
            detail
        ));
    }

    parse_microsoft_translation(&response_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("app.log".to_string()),
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_dict_data,
            translate_text,
            translate_with_google,
            translate_with_microsoft,
            test_ai_config,
            secure_storage_get,
            secure_storage_set,
            secure_storage_remove,
            sync_database_status,
            sync_database_save_url,
            sync_database_clear,
            sync_fetch_config,
            sync_upload_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::io;

    use super::{
        database_config_from_url, database_connection_error_message, database_url_preview,
        google_target_language, normalize_openai_base_url, parse_google_translation,
        parse_microsoft_translation, redact_database_error, sync_database_root_cert_store,
        sync_database_accepts_invalid_tls, sync_upload_config_sql, validate_database_url,
        validate_microsoft_token,
    };
    use tokio_postgres::config::{Host, SslMode};

    #[test]
    fn keeps_provider_base_url_unchanged() {
        assert_eq!(
            normalize_openai_base_url("https://token.sensenova.cn/v1"),
            "https://token.sensenova.cn/v1"
        );
    }

    #[test]
    fn converts_full_chat_completion_endpoint_to_base_url() {
        assert_eq!(
            normalize_openai_base_url("https://token.sensenova.cn/v1/chat/completions"),
            "https://token.sensenova.cn/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://token.sensenova.cn/v1/chat/completions/"),
            "https://token.sensenova.cn/v1"
        );
    }

    #[test]
    fn chooses_google_target_language_for_cjk_input() {
        assert_eq!(google_target_language("你好"), "en");
        assert_eq!(google_target_language("Hello"), "zh-CN");
    }

    #[test]
    fn parses_google_translation_sentences() {
        let response = r#"{"sentences":[{"trans":"你好！"},{"trans":"世界。"}],"src":"en"}"#;

        assert_eq!(parse_google_translation(response).unwrap(), "你好！ 世界。");
    }

    #[test]
    fn parses_microsoft_translation_texts() {
        let response = r#"[{"translations":[{"text":"你好！"},{"text":"世界。"}],"detectedLanguage":{"language":"en"}}]"#;

        assert_eq!(
            parse_microsoft_translation(response).unwrap(),
            "你好！ 世界。"
        );
    }

    #[test]
    fn rejects_invalid_microsoft_tokens() {
        assert!(validate_microsoft_token("Client Browser Version not supported").is_err());
        assert!(validate_microsoft_token("header.payload.signature").is_ok());
    }

    #[test]
    fn validates_postgres_database_urls() {
        assert!(validate_database_url(
            "postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
        )
        .is_ok());
        assert!(validate_database_url(
            "postgres://postgres.abc:p%40ss%2Fword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
        )
        .is_ok());
        assert!(validate_database_url(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslaccept=invalid"
        )
        .is_ok());
        assert!(validate_database_url(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=disable"
        )
        .is_err());
        assert!(validate_database_url("postgresql://postgres.example:h@example.invalid/postgres")
            .is_err());
        assert!(validate_database_url("https://example.com/postgres").is_err());
        assert!(validate_database_url("not a url").is_err());
    }

    #[test]
    fn rejects_urls_that_do_not_point_at_supabase_database_hosts() {
        let error =
            validate_database_url("postgresql://postgres.example:h@example.invalid/postgres")
                .unwrap_err();

        assert!(error.contains("主机名看起来不正确"));
        assert!(error.contains("example.invalid"));
    }

    #[test]
    fn builds_postgres_config_from_supabase_pooler_url() {
        let config = database_config_from_url(
            "postgres://postgres.abc:p%40ss%2Fword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
        )
        .unwrap();

        assert_eq!(config.get_user(), Some("postgres.abc"));
        assert_eq!(config.get_password(), Some(&b"p@ss/word"[..]));
        assert_eq!(config.get_dbname(), Some("postgres"));
        assert_eq!(config.get_ports(), &[6543]);
        assert_eq!(
            config.get_connect_timeout(),
            Some(&std::time::Duration::from_secs(15))
        );
        assert_eq!(
            config.get_hosts(),
            &[Host::Tcp("aws-0-us-east-1.pooler.supabase.com".to_string())]
        );
        assert_eq!(config.get_ssl_mode(), SslMode::Require);
        assert!(!format!("{:?}", config).contains("p@ss/word"));
    }

    #[test]
    fn only_accepts_invalid_database_tls_with_explicit_opt_in() {
        assert!(!sync_database_accepts_invalid_tls(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
        ));
        assert!(sync_database_accepts_invalid_tls(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslaccept=invalid"
        ));
        assert!(sync_database_accepts_invalid_tls(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=INVALID"
        ));
        assert!(!sync_database_accepts_invalid_tls(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslaccept=strict"
        ));
    }

    #[test]
    fn upload_sql_serializes_updated_at_as_text_before_database_cast() {
        let sql = sync_upload_config_sql();

        assert!(sql.contains("$3::text::timestamptz"));
        assert!(!sql.contains("$3::timestamptz"));
    }

    #[test]
    fn builds_database_tls_root_store() {
        let roots = sync_database_root_cert_store(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
        )
        .unwrap();

        assert!(roots.len() >= webpki_roots::TLS_SERVER_ROOTS.len());
    }

    #[test]
    fn rejects_invalid_explicit_database_tls_root_cert() {
        let error = sync_database_root_cert_store(
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslrootcert=/path/that/does/not/exist.pem",
        )
        .unwrap_err();

        assert!(error.contains("读取 Supabase CA 证书失败"));
    }

    #[test]
    fn previews_database_url_without_password() {
        assert_eq!(
            database_url_preview(
                "postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
            ),
            Some("postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres".to_string())
        );
    }

    #[test]
    fn expands_database_connection_error_without_exposing_secrets() {
        let database_url =
            "postgres://postgres.abc:p%40ss%2Fword@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
        let error = io::Error::new(
            io::ErrorKind::ConnectionRefused,
            "tcp connect failed for p@ss/word",
        );

        let message = database_connection_error_message(&error, database_url);

        assert!(
            message.contains("postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres")
        );
        assert!(message.contains("tcp connect failed"));
        assert!(!message.contains(database_url));
        assert!(!message.contains("p@ss/word"));
        assert!(!message.contains("p%40ss%2Fword"));
    }

    #[test]
    fn explains_unknown_issuer_database_errors() {
        let database_url =
            "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
        let error = io::Error::new(
            io::ErrorKind::InvalidData,
            "error performing TLS handshake: invalid peer certificate: UnknownIssuer",
        );

        let message = database_connection_error_message(&error, database_url);

        assert!(message.contains("Server root certificate"));
        assert!(message.contains("跳过证书校验"));
        assert!(!message.contains("secret"));
    }

    #[test]
    fn redacts_database_error_source_chain() {
        let error = io::Error::new(
            io::ErrorKind::Other,
            io::Error::new(io::ErrorKind::TimedOut, "connection timed out"),
        );

        assert_eq!(
            redact_database_error(&error, "postgres://postgres.abc:secret@host:5432/postgres"),
            "connection timed out"
        );
    }

    #[test]
    fn does_not_over_redact_messages_when_url_password_is_too_short() {
        let message = redact_database_error(
            &io::Error::new(
                io::ErrorKind::NotFound,
                "failed to lookup address information: nodename nor servname provided",
            ),
            "postgresql://postgres.example:h@example.invalid/postgres",
        );

        assert_eq!(
            message,
            "failed to lookup address information: nodename nor servname provided"
        );
    }
}
