use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::async_runtime::Mutex;
use tauri_plugin_http::reqwest;

use crate::response_detail;

const GOOGLE_ENDPOINT: &str = "https://translate.google.com/translate_a/single";
const BING_PAGE: &str = "https://cn.bing.com/translator";
const GOOGLE_MAX_RATE_LIMIT_RETRIES: usize = 2;
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub struct WebTranslator {
    client: reqwest::Client,
    bing_session: Mutex<Option<BingSession>>,
}

impl WebTranslator {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .user_agent(USER_AGENT)
                .cookie_store(true)
                // GTX can reject HTTP/2 with 429 while the same HTTP/1.1 request succeeds.
                .http1_only()
                .build()?,
            bing_session: Mutex::new(None),
        })
    }

    pub async fn google(&self, text: &str, target_language: &str) -> Result<String, String> {
        self.google_at_endpoint(text, target_language, GOOGLE_ENDPOINT)
            .await
    }

    pub async fn bing(&self, text: &str, target_language: &str) -> Result<String, String> {
        self.bing_at_endpoint(text, target_language, BING_PAGE)
            .await
    }

    async fn google_at_endpoint(
        &self,
        text: &str,
        target_language: &str,
        endpoint: &str,
    ) -> Result<String, String> {
        if text.trim().is_empty() {
            return Ok(String::new());
        }

        for retry_index in 0..=GOOGLE_MAX_RATE_LIMIT_RETRIES {
            let response = self
                .client
                .get(endpoint)
                .query(&[
                    ("client", "gtx"),
                    ("dt", "t"),
                    ("dj", "1"),
                    ("ie", "UTF-8"),
                    ("sl", "auto"),
                    ("tl", target_language),
                    ("q", text),
                ])
                .send()
                .await
                .map_err(|error| network_error("Google 翻译", error))?;

            let rate_limited = response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS;
            if rate_limited && retry_index < GOOGLE_MAX_RATE_LIMIT_RETRIES {
                let delay = google_rate_limit_delay(response.headers(), retry_index);
                log::warn!(
                    "Google 翻译触发限流，{} 秒后进行第 {} 次重试",
                    delay.as_secs(),
                    retry_index + 1
                );
                if !delay.is_zero() {
                    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(delay))
                        .await
                        .map_err(|error| format!("等待 Google 翻译重试失败: {error}"))?;
                }
                continue;
            }

            let body = read_response(response, "Google 翻译")
                .await
                .map_err(|error| {
                    if rate_limited {
                        format!("{error}（已自动重试 {GOOGLE_MAX_RATE_LIMIT_RETRIES} 次）")
                    } else {
                        error
                    }
                })?;
            return parse_google_translation(&body);
        }
        unreachable!("Google 翻译重试循环必须返回结果")
    }

    async fn bing_at_endpoint(
        &self,
        text: &str,
        target_language: &str,
        page_endpoint: &str,
    ) -> Result<String, String> {
        if text.trim().is_empty() {
            return Ok(String::new());
        }
        let target_language = match target_language {
            "zh-CN" => "zh-Hans",
            "zh-TW" => "zh-Hant",
            other => other,
        };
        let chunks = bing_chunks(text);
        let mut translated = String::new();
        for (index, (chunk, separator)) in chunks.iter().enumerate() {
            if !chunk.trim().is_empty() {
                translated.push_str(
                    &self
                        .bing_chunk(chunk, target_language, page_endpoint)
                        .await?,
                );
            } else {
                translated.push_str(chunk);
            }
            translated.push_str(separator);
            if separator.is_empty() && index + 1 < chunks.len() {
                // A forced split inside a long word must not glue translated words together.
                translated.push('\n');
            }
        }
        Ok(translated)
    }

    async fn bing_chunk(
        &self,
        text: &str,
        target_language: &str,
        page_endpoint: &str,
    ) -> Result<String, String> {
        for attempt in 0..=1 {
            let session = self.get_bing_session(page_endpoint).await?;
            let mut endpoint = session.page.clone();
            endpoint.set_path("/ttranslatev3");
            endpoint.set_query(None);
            let response = self
                .client
                .post(endpoint)
                .query(&[
                    ("isVertical", "1"),
                    ("IG", &session.ig),
                    ("IID", &session.iid),
                ])
                .header(reqwest::header::REFERER, session.page.as_str())
                .form(&[
                    ("text", text),
                    ("fromLang", "auto-detect"),
                    ("to", target_language),
                    ("key", &session.key),
                    ("token", &session.token),
                    ("tryFetchingGenderDebiasedTranslations", "true"),
                ])
                .send()
                .await
                .map_err(|error| network_error("必应翻译", error))?;
            let body = read_response(response, "必应翻译").await?;
            let json: serde_json::Value = serde_json::from_str(&body)
                .map_err(|error| format!("解析必应翻译响应失败: {error}"))?;

            if json.get("statusCode").and_then(|value| value.as_u64()) == Some(205) {
                self.invalidate_bing_session(&session).await;
                if attempt == 0 {
                    continue;
                }
                return Err("必应翻译凭证失效（代码 205），刷新后仍失败，请稍后重试".to_string());
            }
            return parse_bing_translation(&json);
        }
        unreachable!("必应翻译重试循环必须返回结果")
    }

    async fn get_bing_session(&self, page_endpoint: &str) -> Result<BingSession, String> {
        // Only page refresh is serialized; translations can share a valid session concurrently.
        let mut cached = self.bing_session.lock().await;
        if let Some(session) = cached
            .as_ref()
            .filter(|session| !session.is_expired(SystemTime::now()))
        {
            return Ok(session.clone());
        }

        let response = self
            .client
            .get(page_endpoint)
            .header(reqwest::header::CACHE_CONTROL, "no-cache")
            .send()
            .await
            .map_err(|error| network_error("必应翻译页面", error))?;
        let page = response.url().clone();
        let requested =
            reqwest::Url::parse(page_endpoint).map_err(|_| "必应翻译页面地址无效".to_string())?;
        if page.scheme() != requested.scheme()
            || (page.host_str() != requested.host_str()
                && !matches!(page.host_str(), Some("www.bing.com" | "cn.bing.com")))
        {
            return Err("必应翻译页面重定向到了不支持的地址".to_string());
        }
        let html = read_response(response, "必应翻译页面").await?;
        let session = BingSession::from_html(&html, page)?;
        *cached = Some(session.clone());
        Ok(session)
    }

    async fn invalidate_bing_session(&self, rejected: &BingSession) {
        let mut cached = self.bing_session.lock().await;
        if cached
            .as_ref()
            .is_some_and(|current| current.key == rejected.key && current.token == rejected.token)
        {
            *cached = None;
        }
    }
}

#[derive(Clone)]
struct BingSession {
    page: reqwest::Url,
    ig: String,
    iid: String,
    key: String,
    token: String,
    expires_at: SystemTime,
}

impl BingSession {
    fn from_html(html: &str, page: reqwest::Url) -> Result<Self, String> {
        let ig = html
            .split_once("IG:")
            .and_then(|(_, value)| quoted_value(value))
            .ok_or_else(|| "必应翻译页面缺少 IG".to_string())?;
        let iid = html
            .split_once("data-iid")
            .and_then(|(_, value)| value.trim_start().strip_prefix('='))
            .and_then(quoted_value)
            .ok_or_else(|| "必应翻译页面缺少 IID".to_string())?;
        let parameters = html
            .split_once("params_AbusePreventionHelper")
            .and_then(|(_, value)| value.trim_start().strip_prefix('='))
            .ok_or_else(|| "必应翻译页面缺少 token 参数".to_string())?;
        let (key, token, lifetime): (u64, String, u64) =
            Deserialize::deserialize(&mut serde_json::Deserializer::from_str(parameters))
                .map_err(|_| "必应翻译页面 token 参数无效".to_string())?;
        if key == 0 || token.trim().is_empty() || lifetime == 0 {
            return Err("必应翻译页面 token 参数为空或无效".to_string());
        }
        // Easydict renews at half the page-provided lifetime, measured from key's timestamp.
        let expires_at = key
            .checked_add(lifetime / 2)
            .and_then(|millis| UNIX_EPOCH.checked_add(Duration::from_millis(millis)))
            .ok_or_else(|| "必应翻译 token 有效期无效".to_string())?;
        Ok(Self {
            page,
            ig: ig.to_string(),
            iid: iid.to_string(),
            key: key.to_string(),
            token,
            expires_at,
        })
    }

    fn is_expired(&self, now: SystemTime) -> bool {
        now >= self.expires_at
    }
}

fn quoted_value(value: &str) -> Option<&str> {
    value
        .trim_start()
        .strip_prefix('"')?
        .split_once('"')
        .map(|(value, _)| value)
        .filter(|value| !value.is_empty())
}

fn parse_google_translation(response_text: &str) -> Result<String, String> {
    let json: serde_json::Value = serde_json::from_str(response_text)
        .map_err(|error| format!("解析 Google 翻译响应失败: {error}"))?;
    let translated: String = json
        .get("sentences")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Google 翻译响应缺少 sentences".to_string())?
        .iter()
        .filter_map(|item| item.get("trans").and_then(|value| value.as_str()))
        .collect();
    if translated.trim().is_empty() {
        return Err("Google 翻译响应缺少 sentences[].trans".to_string());
    }
    Ok(translated)
}

fn parse_bing_translation(json: &serde_json::Value) -> Result<String, String> {
    if let Some(code) = json.get("statusCode") {
        return Err(format!(
            "必应翻译服务错误（代码 {code}）：{}",
            response_detail(&json.to_string())
        ));
    }
    // One source text and one target language produce one translation; later items are metadata.
    let translated = json
        .pointer("/0/translations/0/text")
        .and_then(|value| value.as_str())
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| "必应翻译响应缺少 translations[].text".to_string())?;
    Ok(translated.to_string())
}

fn google_rate_limit_delay(headers: &reqwest::header::HeaderMap, retry_index: usize) -> Duration {
    let seconds = headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|seconds| seconds.min(10))
        .unwrap_or(1_u64 << retry_index);
    Duration::from_secs(seconds)
}

fn network_error(service: &str, error: reqwest::Error) -> String {
    if error.is_timeout() {
        format!("{service}超时，请检查网络连接")
    } else if error.is_connect() {
        format!(
            "连接{service}失败，请检查网络或代理设置：{}",
            error.without_url()
        )
    } else {
        format!("发送{service}请求失败：{}", error.without_url())
    }
}

async fn read_response(response: reqwest::Response, service: &str) -> Result<String, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取{service}响应失败：{}", error.without_url()))?;
    if status.is_success() {
        return Ok(body);
    }
    let prefix = if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        format!("{service}请求过于频繁（HTTP 429），请稍后重试")
    } else {
        format!("{service}请求失败（HTTP {}）", status.as_u16())
    };
    let detail = response_detail(&body);
    Err(if detail.is_empty() {
        prefix
    } else {
        format!("{prefix}：{detail}")
    })
}

fn bing_chunks(mut text: &str) -> Vec<(&str, &str)> {
    let mut chunks = Vec::new();
    while !text.is_empty() {
        // Follow the web input's 1000-unit budget without dropping the rest of the source.
        let mut units = 0;
        let limit = text.char_indices().find_map(|(index, ch)| {
            units += ch.len_utf16();
            (units > 1_000).then_some(index)
        });
        let Some(limit) = limit else {
            chunks.push((text, ""));
            break;
        };
        let end = text[..limit]
            .rfind(char::is_whitespace)
            .map(|index| text[..index].trim_end().len())
            .unwrap_or(limit);
        let (chunk, rest) = text.split_at(end);
        let separator_end = rest.len() - rest.trim_start().len();
        let (separator, remaining) = rest.split_at(separator_end);
        chunks.push((chunk, separator));
        text = remaining;
    }
    chunks
}

#[cfg(test)]
mod tests;
