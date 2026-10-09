use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_http::reqwest;
use tauri_plugin_log::{Target, TargetKind};

mod clipboard_translation;
mod history;
mod screenshot_store;
mod secret_store;
mod shortcuts;

use screenshot_store::{is_screenshot_temp_path, ScreenshotStore};
use secret_store::FileSecretStore;

const SECRETS_FILE_NAME: &str = "secrets.json";
const GOOGLE_TRANSLATE_ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";
const GOOGLE_MAX_RATE_LIMIT_RETRIES: usize = 2;
const GOOGLE_MAX_RETRY_AFTER_SECS: u64 = 10;
const MICROSOFT_TRANSLATOR_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0";

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturedScreenshot {
    image_path: String,
    work_area: ScreenRegion,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn secure_storage_get(
    store: tauri::State<'_, FileSecretStore>,
    key: String,
) -> Result<Option<String>, String> {
    store.get(&key)
}

#[tauri::command]
fn secure_storage_set(
    store: tauri::State<'_, FileSecretStore>,
    key: String,
    value: String,
) -> Result<(), String> {
    store.set(&key, &value)
}

#[tauri::command]
fn secure_storage_remove(
    store: tauri::State<'_, FileSecretStore>,
    key: String,
) -> Result<(), String> {
    store.remove(&key)
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

fn validate_screen_region(region: ScreenRegion) -> Result<ScreenRegion, String> {
    if !region.x.is_finite()
        || !region.y.is_finite()
        || !region.width.is_finite()
        || !region.height.is_finite()
    {
        return Err("截图区域包含无效坐标".to_string());
    }
    if region.width < 2.0 || region.height < 2.0 {
        return Err("截图区域太小".to_string());
    }

    Ok(region)
}

fn rounded_capture_region(region: ScreenRegion) -> Result<(i64, i64, u64, u64), String> {
    let region = validate_screen_region(region)?;
    Ok((
        region.x.round() as i64,
        region.y.round() as i64,
        region.width.round().max(2.0) as u64,
        region.height.round().max(2.0) as u64,
    ))
}

fn screenshot_temp_path(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    std::env::temp_dir().join(format!(
        "fanyifanyi-{}-{}-{}.png",
        prefix,
        std::process::id(),
        nanos
    ))
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn ensure_screen_capture_access() -> Result<(), String> {
    let allowed = unsafe { CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() };
    if allowed {
        return Ok(());
    }

    Err("无法截图。请在 macOS 系统设置 > 隐私与安全性 > 屏幕录制 中允许 fanyifanyi。".to_string())
}

#[tauri::command]
fn delete_screenshot_file(
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ScreenshotStore>,
    image_path: String,
) -> Result<(), String> {
    store.release(Path::new(&image_path), window.label())
}

#[tauri::command]
fn transfer_screenshot_file(
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ScreenshotStore>,
    image_path: String,
    target_window_label: String,
) -> Result<bool, String> {
    store.transfer(
        Path::new(&image_path),
        window.label(),
        &target_window_label,
        || {
            window
                .app_handle()
                .get_webview_window(&target_window_label)
                .is_some()
        },
    )
}

fn logical_work_area(work_area: &tauri::PhysicalRect<i32, u32>, scale_factor: f64) -> ScreenRegion {
    let position = work_area.position.to_logical::<f64>(scale_factor);
    let size = work_area.size.to_logical::<f64>(scale_factor);
    ScreenRegion {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
}

#[tauri::command]
fn capture_screen_region(
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ScreenshotStore>,
    region: ScreenRegion,
) -> Result<CapturedScreenshot, String> {
    let region = validate_screen_region(region)?;
    let app = window.app_handle();
    let monitor = app
        .monitor_from_point(
            region.x + region.width / 2.0,
            region.y + region.height / 2.0,
        )
        .map_err(|error| format!("读取显示器工作区失败: {}", error))?
        .ok_or_else(|| "无法识别当前显示器".to_string())?;
    let work_area = logical_work_area(monitor.work_area(), monitor.scale_factor());
    let image_path = screenshot_temp_path("screen");
    let capture_result = capture_screen_region_impl(region, &image_path);
    let owner_exists = store.register(image_path.clone(), window.label(), || {
        app.get_webview_window(window.label()).is_some()
    })?;
    if let Err(error) = capture_result {
        let _ = store.release(&image_path, window.label());
        return Err(error);
    }
    if !owner_exists {
        return Err("截图窗口已关闭".to_string());
    }
    Ok(CapturedScreenshot {
        image_path: image_path.to_string_lossy().into_owned(),
        work_area,
    })
}

#[cfg(target_os = "macos")]
fn capture_screen_region_impl(region: ScreenRegion, image_path: &Path) -> Result<(), String> {
    ensure_screen_capture_access()?;
    let (x, y, width, height) = rounded_capture_region(region)?;
    let rect = format!("{},{},{},{}", x, y, width, height);

    let output = Command::new("screencapture")
        .args(["-x", "-R", &rect])
        .arg(image_path)
        .output()
        .map_err(|error| format!("调用 macOS 截图失败: {}", error))?;

    if !output.status.success() || !image_path.exists() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if detail.is_empty() {
            return Err(
                "无法截图。请在 macOS 系统设置 > 隐私与安全性 > 屏幕录制 中允许 fanyifanyi。"
                    .to_string(),
            );
        }
        return Err(format!(
            "无法截图。请检查屏幕录制权限。原始错误：{}",
            detail
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn capture_screen_region_impl(_region: ScreenRegion, _image_path: &Path) -> Result<(), String> {
    Err("截图翻译第一版仅支持 macOS".to_string())
}

fn vision_roi(
    image_region: ScreenRegion,
    image_width: f64,
    image_height: f64,
) -> Result<(f64, f64, f64, f64), String> {
    let image_region = validate_screen_region(image_region)?;
    if !image_width.is_finite()
        || !image_height.is_finite()
        || image_width <= 0.0
        || image_height <= 0.0
    {
        return Err("截图尺寸无效".to_string());
    }

    let x = (image_region.x / image_width).clamp(0.0, 1.0);
    let width = (image_region.width / image_width).clamp(0.0, 1.0 - x);
    let height = (image_region.height / image_height).clamp(0.0, 1.0);
    let y = (1.0 - ((image_region.y + image_region.height) / image_height)).clamp(0.0, 1.0);

    if width <= 0.0 || height <= 0.0 {
        return Err("截图区域超出图片范围".to_string());
    }

    Ok((x, y, width, height))
}

#[tauri::command]
async fn recognize_screenshot_text(
    image_path: String,
    image_region: ScreenRegion,
    image_width: f64,
    image_height: f64,
) -> Result<String, String> {
    let image_path = PathBuf::from(image_path);
    if !is_screenshot_temp_path(&image_path) {
        return Err("截图临时文件路径无效".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        recognize_screenshot_text_impl(image_path, image_region, image_width, image_height)
    })
    .await
    .map_err(|error| format!("本地 OCR 任务失败: {error}"))?
}

#[cfg(target_os = "macos")]
fn recognize_screenshot_text_impl(
    image_path: PathBuf,
    image_region: ScreenRegion,
    image_width: f64,
    image_height: f64,
) -> Result<String, String> {
    use objc2::{rc::autoreleasepool, AnyThread, ClassType};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
    };

    if !image_path.exists() {
        return Err("截图文件不存在".to_string());
    }
    let (roi_x, roi_y, roi_width, roi_height) =
        vision_roi(image_region, image_width, image_height)?;

    autoreleasepool(|_| {
        let bytes = std::fs::read(&image_path)
            .map_err(|error| format!("读取截图文件失败: {}", error))?;
        let data = NSData::with_bytes(&bytes);
        let options = NSDictionary::new();

        let handler = VNImageRequestHandler::initWithData_options(
            VNImageRequestHandler::alloc(),
            &data,
            &options,
        );
        let request = unsafe { VNRecognizeTextRequest::init(VNRecognizeTextRequest::alloc()) };
        let english = NSString::from_str("en-US");
        let languages = NSArray::from_slice(&[&*english]);

        request.setRecognitionLanguages(&languages);
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        // Revision 3 can stall in E5RT on first use. Revision 2 supports our
        // English OCR without changing Accurate recognition or language correction.
        #[allow(deprecated)]
        unsafe {
            let revision = objc2_vision::VNRecognizeTextRequestRevision2;
            let supported: objc2::rc::Retained<objc2_foundation::NSIndexSet> =
                objc2::msg_send![VNRecognizeTextRequest::class(), supportedRevisions];
            if supported.containsIndex(revision) {
                request.setRevision(revision);
            }
        }
        unsafe {
            request.as_super().setRegionOfInterest(CGRect::new(
                CGPoint::new(roi_x, roi_y),
                CGSize::new(roi_width, roi_height),
            ));
        }

        let request_for_handler = request.clone().into_super().into_super();
        let requests = NSArray::<VNRequest>::from_retained_slice(&[request_for_handler]);
        handler
            .performRequests_error(&requests)
            .map_err(|error| format!("本地 OCR 失败: {:?}", error))?;

        let observations = request
            .results()
            .ok_or_else(|| "本地 OCR 没有返回结果".to_string())?;
        let mut lines = Vec::new();
        for observation in observations.iter() {
            let candidates = observation.topCandidates(1);
            let Some(candidate) = (unsafe { candidates.firstObject_unchecked() }) else {
                continue;
            };
            let text = candidate.string().to_string();
            let text = text.trim();
            if !text.is_empty() {
                lines.push(text.to_string());
            }
        }

        if lines.is_empty() {
            return Err("未识别到英文文本".to_string());
        }

        Ok(lines.join("\n"))
    })
}

#[cfg(not(target_os = "macos"))]
fn recognize_screenshot_text_impl(
    _image_path: PathBuf,
    _image_region: ScreenRegion,
    _image_width: f64,
    _image_height: f64,
) -> Result<String, String> {
    Err("截图翻译第一版仅支持 macOS".to_string())
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

fn stored_model_api_key(store: &FileSecretStore, model_id: &str) -> Result<String, String> {
    let key = format!("ai-config:model:{model_id}:apiKey");
    match store.get(&key)? {
        Some(value) if !value.trim().is_empty() => Ok(value),
        _ => Err("请先填写 API Key".to_string()),
    }
}

#[tauri::command]
async fn translate_with_ai(
    store: tauri::State<'_, FileSecretStore>,
    base_url: String,
    model: String,
    model_id: String,
    prompt: String,
) -> Result<String, String> {
    let api_key = stored_model_api_key(store.inner(), &model_id)?;
    let (base_url, api_key, model) = validate_ai_request_config(base_url, api_key, model)?;
    if prompt.trim().is_empty() {
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
                "content": prompt
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
async fn translate_with_google(text: String, target_language: String) -> Result<String, String> {
    translate_with_google_target(text, &target_language).await
}

async fn translate_with_google_target(
    text: String,
    target_language: &str,
) -> Result<String, String> {
    translate_with_google_target_at_endpoint(text, target_language, GOOGLE_TRANSLATE_ENDPOINT).await
}

fn google_rate_limit_delay(headers: &reqwest::header::HeaderMap, retry_index: usize) -> Duration {
    let retry_after_secs = headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|seconds| seconds.min(GOOGLE_MAX_RETRY_AFTER_SECS));

    Duration::from_secs(retry_after_secs.unwrap_or(1_u64 << retry_index))
}

async fn wait_for_google_retry(delay: Duration) -> Result<(), String> {
    if delay.is_zero() {
        return Ok(());
    }

    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(delay))
        .await
        .map_err(|error| format!("等待 Google 翻译重试失败: {error}"))
}

async fn translate_with_google_target_at_endpoint(
    text: String,
    target_language: &str,
    endpoint: &str,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let url = format!(
        "{}?client=gtx&dt=t&dj=1&ie=UTF-8&sl=auto&tl={}&q={}",
        endpoint,
        target_language,
        urlencoding::encode(&text)
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("创建 Google 翻译客户端失败: {}", error))?;

    for retry_index in 0..=GOOGLE_MAX_RATE_LIMIT_RETRIES {
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
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS
            && retry_index < GOOGLE_MAX_RATE_LIMIT_RETRIES
        {
            let delay = google_rate_limit_delay(response.headers(), retry_index);
            log::warn!(
                "Google 翻译触发限流，{} 秒后进行第 {} 次重试",
                delay.as_secs(),
                retry_index + 1
            );
            wait_for_google_retry(delay).await?;
            continue;
        }

        let response_text = response
            .text()
            .await
            .map_err(|error| format!("读取 Google 翻译响应失败: {}", error))?;

        if !status.is_success() {
            let detail = response_detail(&response_text);
            let prefix = if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                format!(
                    "Google 翻译请求过于频繁（HTTP 429，已自动重试 {} 次）",
                    GOOGLE_MAX_RATE_LIMIT_RETRIES
                )
            } else {
                format!("Google 翻译请求失败（HTTP {}）", status.as_u16())
            };
            if detail.is_empty() {
                return Err(prefix);
            }
            return Err(format!("{}：{}", prefix, detail));
        }

        return parse_google_translation(&response_text);
    }

    unreachable!("Google 翻译重试循环必须返回结果")
}

#[tauri::command]
async fn translate_with_microsoft(
    text: String,
    target_language: String,
) -> Result<String, String> {
    translate_with_microsoft_target(text, &target_language).await
}

async fn translate_with_microsoft_target(
    text: String,
    target_language: &str,
) -> Result<String, String> {
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
        .manage(ScreenshotStore::default())
        .on_window_event(|window, event| {
            clipboard_translation::on_window_event(window, event);
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Err(error) = window
                    .state::<ScreenshotStore>()
                    .release_window(window.label())
                {
                    log::warn!("窗口截图清理失败: {}", error);
                }
            }
        })
        .setup(|app| {
            let path = app.path().app_data_dir()?.join(SECRETS_FILE_NAME);
            app.manage(FileSecretStore::new(path));
            app.manage(history::HistoryStore::new(
                app.path().app_data_dir()?.join("history-v1.json"),
            ));
            clipboard_translation::initialize(app.handle());
            shortcuts::initialize(app.handle());
            Ok(())
        })
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
            capture_screen_region,
            delete_screenshot_file,
            transfer_screenshot_file,
            get_dict_data,
            recognize_screenshot_text,
            translate_with_ai,
            translate_with_google,
            translate_with_microsoft,
            test_ai_config,
            secure_storage_get,
            secure_storage_set,
            secure_storage_remove,
            history::history_get,
            history::history_record,
            history::history_set_enabled,
            history::history_set_favorite,
            history::history_delete,
            history::history_clear,
            shortcuts::get_screenshot_shortcut,
            shortcuts::configure_screenshot_shortcut,
            shortcuts::get_clipboard_shortcut,
            shortcuts::configure_clipboard_shortcut,
            clipboard_translation::get_clipboard_translation_session,
            clipboard_translation::is_clipboard_translation_current,
            clipboard_translation::close_clipboard_translation,
            clipboard_translation::resume_clipboard_translation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Read, Write},
        net::TcpListener,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        thread,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    use super::{
        is_screenshot_temp_path, logical_work_area, normalize_openai_base_url,
        parse_google_translation, parse_microsoft_translation, recognize_screenshot_text,
        screenshot_temp_path, stored_model_api_key, translate_with_google_target_at_endpoint,
        validate_microsoft_token, vision_roi, CapturedScreenshot, ScreenRegion, ScreenshotStore,
    };
    use crate::secret_store::FileSecretStore;

    struct GoogleTestResponse {
        status: &'static str,
        retry_after_secs: Option<u64>,
        body: &'static str,
    }

    fn run_google_translation_test(
        responses: Vec<GoogleTestResponse>,
    ) -> (Result<String, String>, usize) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!(
            "http://{}/translate_a/single",
            listener.local_addr().unwrap()
        );
        let request_count = Arc::new(AtomicUsize::new(0));
        let server_request_count = Arc::clone(&request_count);
        let server = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(1);
            while server_request_count.load(Ordering::SeqCst) < responses.len()
                && Instant::now() < deadline
            {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let mut request = [0_u8; 4096];
                        stream.read(&mut request).unwrap();
                        let attempt = server_request_count.fetch_add(1, Ordering::SeqCst);
                        let response = &responses[attempt];
                        let retry_after = response
                            .retry_after_secs
                            .map(|seconds| format!("Retry-After: {seconds}\r\n"))
                            .unwrap_or_default();
                        write!(
                            stream,
                            "HTTP/1.1 {}\r\nContent-Length: {}\r\n{retry_after}Connection: close\r\n\r\n{}",
                            response.status,
                            response.body.len(),
                            response.body
                        )
                        .unwrap();
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("测试服务器接收请求失败: {error}"),
                }
            }
        });

        let result = tauri::async_runtime::block_on(translate_with_google_target_at_endpoint(
            "hello".to_string(),
            "zh-CN",
            &endpoint,
        ));
        server.join().unwrap();

        (result, request_count.load(Ordering::SeqCst))
    }

    #[test]
    fn translate_with_ai_reads_the_saved_model_key() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "fanyifanyi-translate-key-{}-{unique}.json",
            std::process::id()
        ));
        let store = FileSecretStore::new(path.clone());

        assert_eq!(
            stored_model_api_key(&store, "model-1").unwrap_err(),
            "请先填写 API Key"
        );

        store
            .set("ai-config:model:model-1:apiKey", "sk-saved")
            .unwrap();
        assert_eq!(
            stored_model_api_key(&store, "model-1").unwrap(),
            "sk-saved"
        );

        store
            .set("ai-config:model:model-1:apiKey", "  ")
            .unwrap();
        assert_eq!(
            stored_model_api_key(&store, "model-1").unwrap_err(),
            "请先填写 API Key"
        );

        if path.exists() {
            std::fs::remove_file(path).unwrap();
        }
    }

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
    fn converts_top_left_selection_to_vision_roi() {
        let roi = vision_roi(
            ScreenRegion {
                x: 100.0,
                y: 50.0,
                width: 200.0,
                height: 100.0,
            },
            1000.0,
            500.0,
        )
        .unwrap();

        assert_eq!(roi, (0.1, 0.7, 0.2, 0.2));
    }

    #[test]
    fn only_accepts_app_owned_screenshot_temp_paths() {
        assert!(is_screenshot_temp_path(&screenshot_temp_path("screen")));
        assert!(!is_screenshot_temp_path(&screenshot_temp_path("other")));
        assert!(!is_screenshot_temp_path(
            &std::env::current_dir()
                .unwrap()
                .join("fanyifanyi-screen-1.png")
        ));
    }

    #[test]
    fn deletes_app_owned_screenshot_temp_file() {
        let path = screenshot_temp_path("screen");
        std::fs::write(&path, b"temporary screenshot").unwrap();
        let store = ScreenshotStore::default();
        store.register(path.clone(), "main", || true).unwrap();

        store.release(&path, "main").unwrap();
        assert!(!path.exists());

        store.release(&path, "main").unwrap();
    }

    #[test]
    fn screenshot_work_area_uses_logical_monitor_coordinates() {
        let work_area = logical_work_area(
            &tauri::PhysicalRect {
                position: tauri::PhysicalPosition::new(-2880, 50),
                size: tauri::PhysicalSize::new(2800, 1750),
            },
            2.0,
        );
        let capture = CapturedScreenshot {
            image_path: "screenshot.png".to_string(),
            work_area,
        };

        assert_eq!(
            serde_json::to_value(capture).unwrap(),
            serde_json::json!({
                "imagePath": "screenshot.png",
                "workArea": { "x": -1440.0, "y": 25.0, "width": 1400.0, "height": 875.0 }
            })
        );
    }

    #[test]
    #[ignore = "wall-clock OCR regression; run alone in a fresh process on macOS"]
    #[cfg(target_os = "macos")]
    fn screenshot_ocr_finishes_without_compute_backend_stall() {
        let started = Instant::now();
        recognizes_wide_screenshot_text_with_vision();
        let elapsed = started.elapsed();
        eprintln!("Screenshot OCR completed in {elapsed:?}");
        assert!(
            elapsed < Duration::from_secs(5),
            "small screenshot OCR stalled for {elapsed:?}"
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn recognizes_wide_screenshot_text_with_vision() {
        let path = screenshot_temp_path("screen");
        std::fs::write(&path, include_bytes!("../tests/fixtures/screenshot-ocr.png")).unwrap();
        let result = tauri::async_runtime::block_on(recognize_screenshot_text(
            path.to_string_lossy().into_owned(),
            ScreenRegion {
                x: 20.0,
                y: 70.0,
                width: 1360.0,
                height: 50.0,
            },
            1394.0,
            152.0,
        ));
        std::fs::remove_file(path).unwrap();
        let text = result.expect("valid wide screenshot must remain readable by Vision");
        assert!(text.contains("Screenshot reading overlay"), "{text}");
        assert!(text.contains("original screenshot"), "{text}");
    }

    #[test]
    fn rejects_ocr_for_non_app_screenshot_paths() {
        let err = tauri::async_runtime::block_on(recognize_screenshot_text(
            std::env::current_dir()
                .unwrap()
                .join("fanyifanyi-screen-1.png")
                .to_string_lossy()
                .into_owned(),
            ScreenRegion {
                x: 0.0,
                y: 0.0,
                width: 10.0,
                height: 10.0,
            },
            10.0,
            10.0,
        ))
        .unwrap_err();

        assert_eq!(err, "截图临时文件路径无效");
    }

    #[test]
    fn parses_google_translation_sentences() {
        let response = r#"{"sentences":[{"trans":"你好！"},{"trans":"世界。"}],"src":"en"}"#;

        assert_eq!(parse_google_translation(response).unwrap(), "你好！ 世界。");
    }

    #[test]
    fn retries_google_translation_after_rate_limit() {
        let (result, request_count) = run_google_translation_test(vec![
            GoogleTestResponse {
                status: "429 Too Many Requests",
                retry_after_secs: Some(0),
                body: "rate limited",
            },
            GoogleTestResponse {
                status: "200 OK",
                retry_after_secs: None,
                body: r#"{"sentences":[{"trans":"你好"}]}"#,
            },
        ]);

        assert_eq!(request_count, 2);
        assert_eq!(result.unwrap(), "你好");
    }

    #[test]
    fn stops_retrying_google_translation_after_two_rate_limits() {
        let rate_limit_response = || GoogleTestResponse {
            status: "429 Too Many Requests",
            retry_after_secs: Some(0),
            body: "rate limited",
        };
        let (result, request_count) = run_google_translation_test(vec![
            rate_limit_response(),
            rate_limit_response(),
            rate_limit_response(),
        ]);

        let error = result.unwrap_err();

        assert_eq!(request_count, 3);
        assert!(error.contains("HTTP 429"));
        assert!(error.contains("已自动重试 2 次"));
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
