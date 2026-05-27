use std::time::Duration;

use keyring::{Entry, Error as KeyringError};
use tauri_plugin_http::reqwest;
use tauri_plugin_log::{Target, TargetKind};

const KEYRING_SERVICE: &str = "com.fanyifanyi.app";
const MICROSOFT_TRANSLATOR_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0";

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
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
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
            secure_storage_remove
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        google_target_language, normalize_openai_base_url, parse_google_translation,
        parse_microsoft_translation, validate_microsoft_token,
    };

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
}
