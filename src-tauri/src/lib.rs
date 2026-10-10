use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_http::reqwest;
use tauri_plugin_log::{Target, TargetKind};
use unicode_segmentation::UnicodeSegmentation;

mod clipboard_translation;
mod history;
mod screenshot_store;
mod secret_store;
mod selection_translation;
mod shortcuts;
mod web_translation;

use screenshot_store::{is_screenshot_temp_path, ScreenshotStore};
use secret_store::FileSecretStore;
use web_translation::WebTranslator;

const SECRETS_FILE_NAME: &str = "secrets.json";

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

fn youdao_dictionary_request(q: &str) -> reqwest::RequestBuilder {
    // Fixed Youdao web protocol key, not a user API credential.
    const KEY: &str = "Mk6hqtUp33DGGtoS63tTJbMUYjRrG1Lu";
    let word = format!("{q}webdict");
    let t = (word.graphemes(true).count() % 10).to_string();
    let salt = format!("{:x}", md5::compute(word.as_bytes()));
    let sign = format!(
        "{:x}",
        md5::compute(format!("web{q}{t}{KEY}{salt}").as_bytes())
    );

    reqwest::Client::new()
        .post("https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4")
        .form(&[
            ("q", q),
            ("le", "en"),
            ("client", "web"),
            ("t", &t),
            ("sign", &sign),
            ("keyfrom", "webdict"),
        ])
}

#[tauri::command]
async fn get_dict_data(q: String) -> Result<serde_json::Value, String> {
    let response = match youdao_dictionary_request(&q).send().await {
        Ok(resp) => resp,
        Err(e) => {
            log::error!("词典 API 请求失败 (网络错误): {}", e);
            return Err(format!("网络请求失败: {}", e));
        }
    };

    let response = match response.error_for_status() {
        Ok(resp) => resp,
        Err(e) => {
            log::error!("词典 API 请求失败 (HTTP 错误): {}", e);
            return Err(format!("词典服务请求失败: {}", e));
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
async fn translate_with_google(
    translator: tauri::State<'_, WebTranslator>,
    text: String,
    target_language: String,
) -> Result<String, String> {
    translator.google(&text, &target_language).await
}

#[tauri::command]
async fn translate_with_microsoft(
    translator: tauri::State<'_, WebTranslator>,
    text: String,
    target_language: String,
) -> Result<String, String> {
    translator.bing(&text, &target_language).await
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
            app.manage(WebTranslator::new()?);
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
            shortcuts::get_selection_shortcut,
            shortcuts::configure_selection_shortcut,
            selection_translation::open_selection_accessibility_settings,
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
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use super::{
        is_screenshot_temp_path, logical_work_area, normalize_openai_base_url,
        recognize_screenshot_text, screenshot_temp_path, stored_model_api_key, vision_roi,
        youdao_dictionary_request, CapturedScreenshot, ScreenRegion, ScreenshotStore,
    };
    use crate::secret_store::FileSecretStore;

    #[test]
    fn dictionary_request_matches_youdao_v4_protocol() {
        // Fixed vectors from the Easydict V4 protocol, hashed independently with Python hashlib.
        for (query, t, sign) in [
            ("good", "1", "96eea02156f165866c59ad446fcfa7ed"),
            ("look up", "4", "2b6bb24d534cb0ceb1f008acd03b54e0"),
            ("cafe\u{301}", "1", "0f89f4b0b6a001e664fe63ddc718c762"),
            ("👩‍👩‍👧‍👦", "8", "41aa9fce5207b1d930b6fa4aa4e5791c"),
            ("  a&b+c= 中文?  ", "1", "42ff49c28e93fe451d07cfe3b76af23f"),
        ] {
            let request = youdao_dictionary_request(query).build().unwrap();
            assert_eq!(request.method(), "POST");
            assert_eq!(
                request.url().as_str(),
                "https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4"
            );
            assert_eq!(
                request.headers()["content-type"],
                "application/x-www-form-urlencoded"
            );

            let body = std::str::from_utf8(request.body().unwrap().as_bytes().unwrap()).unwrap();
            let parameters = super::reqwest::Url::parse(&format!("http://localhost/?{body}"))
                .unwrap()
                .query_pairs()
                .into_owned()
                .collect::<std::collections::BTreeMap<_, _>>();
            let expected = [
                ("q", query),
                ("le", "en"),
                ("client", "web"),
                ("keyfrom", "webdict"),
                ("t", t),
                ("sign", sign),
            ]
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .into_iter()
            .collect();
            assert_eq!(parameters, expected, "query: {query:?}");
        }
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
}
