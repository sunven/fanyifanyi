use tauri_plugin_http::reqwest;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    let text = response.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    Ok(json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![greet, get_dict_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
