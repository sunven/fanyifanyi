use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};

use super::*;

const GOOGLE_RESULT: &str =
    r#"{"sentences":[{"trans":"  第一行\n"},{"trans":"\n第二行  "},{"translit":"ignored"}]}"#;
const BING_RESULT: &str = r#"[{"translations":[{"text":"  第一行\n\n第二行  ","to":"zh-Hans"}]},{"inputTransliteration":"ignored"}]"#;

struct Response {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

impl Response {
    fn new(status: u16, body: impl Into<String>) -> Self {
        Self {
            status,
            headers: Vec::new(),
            body: body.into(),
        }
    }

    fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }
}

#[derive(Debug)]
struct Request {
    method: String,
    url: reqwest::Url,
    headers: BTreeMap<String, String>,
    body: String,
}

impl Request {
    fn form(&self) -> BTreeMap<String, String> {
        reqwest::Url::parse(&format!("http://localhost/?{}", self.body))
            .unwrap()
            .query_pairs()
            .into_owned()
            .collect()
    }
}

struct Server {
    url: String,
    requests: Arc<Mutex<Vec<Request>>>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl Server {
    fn new(responses: Vec<Response>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let captured = Arc::clone(&requests);
        let stopped = Arc::clone(&stop);
        let origin = url.clone();
        let thread = thread::spawn(move || {
            for response in responses {
                let mut stream = loop {
                    if stopped.load(Ordering::SeqCst) {
                        return;
                    }
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2));
                        }
                        Err(error) => panic!("{error}"),
                    }
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0; 4096];
                let header_end = loop {
                    let count = stream.read(&mut buffer).unwrap();
                    assert!(count > 0);
                    bytes.extend_from_slice(&buffer[..count]);
                    if let Some(index) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                        break index + 4;
                    }
                };
                let head = std::str::from_utf8(&bytes[..header_end]).unwrap();
                let mut lines = head.lines();
                let mut request_line = lines.next().unwrap().split_whitespace();
                let method = request_line.next().unwrap().to_string();
                let url = reqwest::Url::parse(&format!("{origin}{}", request_line.next().unwrap()))
                    .unwrap();
                let headers: BTreeMap<_, _> = lines
                    .filter_map(|line| line.split_once(':'))
                    .map(|(key, value)| (key.to_ascii_lowercase(), value.trim().to_string()))
                    .collect();
                let length = headers
                    .get("content-length")
                    .map(|value| value.parse().unwrap())
                    .unwrap_or(0);
                while bytes.len() < header_end + length {
                    let count = stream.read(&mut buffer).unwrap();
                    assert!(count > 0);
                    bytes.extend_from_slice(&buffer[..count]);
                }
                captured.lock().unwrap().push(Request {
                    method,
                    url,
                    headers,
                    body: String::from_utf8(bytes[header_end..header_end + length].to_vec())
                        .unwrap(),
                });
                write!(
                    stream,
                    "HTTP/1.1 {} Test\r\nContent-Length: {}\r\nConnection: close\r\n",
                    response.status,
                    response.body.len()
                )
                .unwrap();
                for (name, value) in response.headers {
                    write!(stream, "{name}: {value}\r\n").unwrap();
                }
                write!(stream, "\r\n{}", response.body).unwrap();
            }
        });
        Self {
            url,
            requests,
            stop,
            thread: Some(thread),
        }
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}{path}", self.url)
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let result = self.thread.take().unwrap().join();
        if !thread::panicking() {
            result.unwrap();
        }
    }
}

fn translator() -> WebTranslator {
    WebTranslator {
        client: reqwest::Client::builder()
            .no_proxy()
            .user_agent(USER_AGENT)
            .cookie_store(true)
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap(),
        bing_session: tauri::async_runtime::Mutex::new(None),
    }
}

// Synthetic values with the layout read by Easydict's BingRequest.swift.
fn bing_page_at(token: &str, key: u64, ttl: u64) -> String {
    format!(
        r#"<script>var config = {{IG: "test-ig"}}; var params_AbusePreventionHelper = [{key},"{token}",{ttl}];</script><div data-iid = "translator.5029"></div>"#
    )
}

fn bing_page(token: &str) -> String {
    bing_page_at(
        token,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        3_600_000,
    )
}

fn bing_result(text: &str) -> String {
    serde_json::json!([{ "translations": [{ "text": text, "to": "zh-Hans" }] }]).to_string()
}

#[test]
fn preserves_web_translation_formatting() {
    assert_eq!(
        parse_google_translation(GOOGLE_RESULT).unwrap(),
        "  第一行\n\n第二行  "
    );
    assert_eq!(
        parse_bing_translation(&serde_json::from_str(BING_RESULT).unwrap()).unwrap(),
        "  第一行\n\n第二行  "
    );
    assert_eq!(
        parse_google_translation(r#"{"sentences":[{"trans":"你好！"},{"trans":"世界。"}]}"#)
            .unwrap(),
        "你好！世界。"
    );
}

#[test]
fn rejects_missing_or_empty_translations() {
    for response in [
        "not json",
        "{}",
        r#"{"sentences":[]}"#,
        r#"{"sentences":[{"trans":" \n"}]}"#,
    ] {
        assert!(parse_google_translation(response).is_err());
    }
    for response in ["{}", "[]", r#"[{"translations":[{"text":" \n"}]}]"#] {
        assert!(parse_bing_translation(&serde_json::from_str(response).unwrap()).is_err());
    }
}

#[test]
fn skips_requests_for_blank_text() {
    tauri::async_runtime::block_on(async {
        let service = translator();
        assert_eq!(
            service
                .google_at_endpoint(" \n", "zh-CN", "invalid url")
                .await
                .unwrap(),
            ""
        );
        assert_eq!(
            service
                .bing_at_endpoint(" \n", "zh-CN", "invalid url")
                .await
                .unwrap(),
            ""
        );
    });
}

#[test]
fn google_encodes_the_complete_text_and_target() {
    let server = Server::new(vec![Response::new(200, GOOGLE_RESULT)]);
    let text = "  a&b+c=中文 👩‍💻?\nnext line  ";
    let result = tauri::async_runtime::block_on(translator().google_at_endpoint(
        text,
        "zh-CN&extra=1",
        &server.endpoint("/translate_a/single"),
    ));
    assert!(result.is_ok());
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].method, "GET");
    let query: BTreeMap<_, _> = requests[0].url.query_pairs().into_owned().collect();
    assert_eq!(
        query,
        [
            ("client", "gtx"),
            ("dt", "t"),
            ("dj", "1"),
            ("ie", "UTF-8"),
            ("sl", "auto"),
            ("tl", "zh-CN&extra=1"),
            ("q", text)
        ]
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .into_iter()
        .collect()
    );
    assert!(requests[0].headers["user-agent"].contains("Mozilla"));
}

#[test]
fn retries_google_rate_limits_at_most_twice() {
    for succeeds in [true, false] {
        let rate_limit = || Response::new(429, "rate limited").header("Retry-After", "0");
        let last = if succeeds {
            Response::new(200, GOOGLE_RESULT)
        } else {
            rate_limit()
        };
        let server = Server::new(vec![rate_limit(), rate_limit(), last]);
        let result = tauri::async_runtime::block_on(translator().google_at_endpoint(
            "hello",
            "zh-CN",
            &server.url,
        ));
        assert_eq!(server.requests.lock().unwrap().len(), 3);
        if succeeds {
            assert_eq!(result.unwrap(), "  第一行\n\n第二行  ");
        } else {
            let error = result.unwrap_err();
            assert!(error.contains("HTTP 429"));
            assert!(error.contains("已自动重试 2 次"));
        }
    }
}

#[test]
fn reports_google_http_errors_without_retrying() {
    let server = Server::new(vec![Response::new(
        400,
        r#"{"error":{"message":"invalid target language"}}"#,
    )]);
    let error = tauri::async_runtime::block_on(translator().google_at_endpoint(
        "hello",
        "zh-CN",
        &server.url,
    ))
    .unwrap_err();
    assert!(error.contains("HTTP 400"));
    assert!(error.contains("invalid target language"));
    assert_eq!(server.requests.lock().unwrap().len(), 1);
}

#[test]
fn bounds_google_retry_delays() {
    let mut headers = reqwest::header::HeaderMap::new();
    assert_eq!(google_rate_limit_delay(&headers, 0), Duration::from_secs(1));
    assert_eq!(google_rate_limit_delay(&headers, 1), Duration::from_secs(2));
    headers.insert("retry-after", "600".parse().unwrap());
    assert_eq!(
        google_rate_limit_delay(&headers, 0),
        Duration::from_secs(10)
    );
    headers.insert("retry-after", "invalid".parse().unwrap());
    assert_eq!(google_rate_limit_delay(&headers, 1), Duration::from_secs(2));
}

#[test]
fn bing_uses_web_form_language_codes_and_reuses_credentials() {
    let server = Server::new(vec![
        Response::new(200, bing_page("test+/=token")),
        Response::new(200, BING_RESULT),
        Response::new(200, BING_RESULT),
    ]);
    let text = "  a&b+c=中文 👩‍💻?\nnext line  ";
    tauri::async_runtime::block_on(async {
        let service = translator();
        for target in ["zh-CN", "zh-TW"] {
            service
                .bing_at_endpoint(text, target, &server.endpoint("/translator"))
                .await
                .unwrap();
        }
    });
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 3);
    assert_eq!(requests[0].method, "GET");
    assert_eq!(requests[0].url.path(), "/translator");
    for (request, target) in requests[1..].iter().zip(["zh-Hans", "zh-Hant"]) {
        assert_eq!(request.method, "POST");
        assert_eq!(request.url.path(), "/ttranslatev3");
        let query: BTreeMap<_, _> = request.url.query_pairs().into_owned().collect();
        assert_eq!(query["isVertical"], "1");
        assert_eq!(query["IG"], "test-ig");
        assert_eq!(query["IID"], "translator.5029");
        assert_eq!(
            request.headers["content-type"],
            "application/x-www-form-urlencoded"
        );
        assert!(!request.headers.contains_key("authorization"));
        let form = request.form();
        assert_eq!(form["text"], text);
        assert_eq!(form["fromLang"], "auto-detect");
        assert_eq!(form["to"], target);
        assert_eq!(form["token"], "test+/=token");
        assert!(form["key"].parse::<u64>().unwrap() > 0);
        assert_eq!(form["tryFetchingGenderDebiasedTranslations"], "true");
    }
}

#[test]
fn bing_refreshes_invalid_credentials_only_once_and_discards_them_after_failure() {
    let invalid = r#"{"statusCode":205}"#;
    for succeeds in [true, false] {
        let server = Server::new(vec![
            Response::new(200, bing_page("old-token")),
            Response::new(200, invalid),
            Response::new(200, bing_page("new-token")),
            Response::new(200, if succeeds { BING_RESULT } else { invalid }),
        ]);
        tauri::async_runtime::block_on(async {
            let service = translator();
            let result = service
                .bing_at_endpoint("hello", "zh-CN", &server.endpoint("/translator"))
                .await;
            if succeeds {
                assert!(result.is_ok());
            } else {
                assert!(result.unwrap_err().contains("205"));
                assert!(service.bing_session.lock().await.is_none());
            }
        });
        let requests = server.requests.lock().unwrap();
        assert_eq!(requests.len(), 4);
        assert_eq!(requests[1].form()["token"], "old-token");
        assert_eq!(requests[3].form()["token"], "new-token");
    }
}

#[test]
fn bing_reports_http_and_malformed_responses_without_refreshing() {
    for (status, body, expected) in [
        (429, "rate limited", "HTTP 429"),
        (403, "forbidden", "HTTP 403"),
        (500, r#"{"error":{"message":"unavailable"}}"#, "unavailable"),
        (200, "not json", "解析"),
        (
            200,
            r#"{"statusCode":400,"message":"invalid language"}"#,
            "invalid language",
        ),
    ] {
        let server = Server::new(vec![
            Response::new(200, bing_page("test-token")),
            Response::new(status, body),
        ]);
        let error = tauri::async_runtime::block_on(translator().bing_at_endpoint(
            "hello",
            "en",
            &server.endpoint("/translator"),
        ))
        .unwrap_err();
        assert!(error.contains(expected), "{error}");
        assert_eq!(server.requests.lock().unwrap().len(), 2);
    }
}

#[test]
fn bing_credentials_expire_halfway_through_the_server_lifetime() {
    let page = reqwest::Url::parse("https://www.bing.com/translator").unwrap();
    let session =
        BingSession::from_html(&bing_page_at("test-token", 1_000, 3_600_000), page).unwrap();
    assert!(!session.is_expired(UNIX_EPOCH + Duration::from_millis(1_800_999)));
    assert!(session.is_expired(UNIX_EPOCH + Duration::from_millis(1_801_000)));
}

#[test]
fn bing_rejects_missing_or_invalid_page_credentials() {
    let page = reqwest::Url::parse("https://www.bing.com/translator").unwrap();
    let valid = bing_page("test-token");
    for html in [
        "<html>challenge</html>".to_string(),
        valid.replace("IG:", "missing:"),
        valid.replace("data-iid", "missing"),
        valid.replace("params_AbusePreventionHelper", "missing"),
        bing_page_at("", 1_000, 3_600_000),
        bing_page_at("token", 1_000, 0),
    ] {
        assert!(BingSession::from_html(&html, page.clone()).is_err());
    }
}

#[test]
fn bing_refreshes_an_expired_session_before_translating() {
    let server = Server::new(vec![
        Response::new(200, bing_page("fresh-token")),
        Response::new(200, BING_RESULT),
    ]);
    tauri::async_runtime::block_on(async {
        let service = translator();
        let page = reqwest::Url::parse(&server.endpoint("/translator")).unwrap();
        *service.bing_session.lock().await = Some(
            BingSession::from_html(&bing_page_at("expired-token", 1_000, 3_600_000), page).unwrap(),
        );
        service
            .bing_at_endpoint("hello", "en", &server.endpoint("/translator"))
            .await
            .unwrap();
    });
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].form()["token"], "fresh-token");
}

#[test]
fn concurrent_bing_requests_share_one_page_fetch() {
    let server = Server::new(vec![
        Response::new(200, bing_page("shared-token")),
        Response::new(200, BING_RESULT),
        Response::new(200, BING_RESULT),
    ]);
    tauri::async_runtime::block_on(async {
        let service = Arc::new(translator());
        let handles = (0..2)
            .map(|_| {
                let service = Arc::clone(&service);
                let endpoint = server.endpoint("/translator");
                tauri::async_runtime::spawn(async move {
                    service.bing_at_endpoint("hello", "en", &endpoint).await
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            assert!(handle.await.unwrap().is_ok());
        }
    });
    let requests = server.requests.lock().unwrap();
    assert_eq!(
        requests
            .iter()
            .filter(|request| request.method == "GET")
            .count(),
        1
    );
    assert_eq!(requests.len(), 3);
}

#[test]
fn an_old_bing_failure_cannot_clear_new_credentials() {
    let server = Server::new(vec![Response::new(200, BING_RESULT)]);
    tauri::async_runtime::block_on(async {
        let service = translator();
        let page = reqwest::Url::parse(&server.endpoint("/translator")).unwrap();
        let old = BingSession::from_html(&bing_page("old-token"), page.clone()).unwrap();
        let new = BingSession::from_html(&bing_page("new-token"), page).unwrap();
        *service.bing_session.lock().await = Some(new);
        service.invalidate_bing_session(&old).await;
        service
            .bing_at_endpoint("hello", "en", &server.endpoint("/translator"))
            .await
            .unwrap();
    });
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].form()["token"], "new-token");
}

#[test]
fn bing_uses_the_redirected_origin_and_its_cookie_session() {
    let destination = Server::new(vec![
        Response::new(200, bing_page("test-token"))
            .header("Set-Cookie", "session=test-cookie; Path=/"),
        Response::new(200, BING_RESULT),
    ]);
    let source = Server::new(vec![
        Response::new(302, "").header("Location", &destination.endpoint("/translator"))
    ]);
    tauri::async_runtime::block_on(translator().bing_at_endpoint(
        "hello",
        "en",
        &source.endpoint("/translator"),
    ))
    .unwrap();
    let requests = destination.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].url.path(), "/ttranslatev3");
    assert_eq!(requests[1].headers["cookie"], "session=test-cookie");
    assert_eq!(
        requests[1].headers["referer"],
        destination.endpoint("/translator")
    );
}

#[test]
fn bing_chunking_keeps_every_character_and_respects_utf16_limits() {
    for length in [999, 1_000, 1_001] {
        let text = "a".repeat(length);
        assert_eq!(
            bing_chunks(&text).len(),
            if length <= 1_000 { 1 } else { 2 }
        );
    }
    for text in [
        "中文".repeat(1_001),
        "🙂".repeat(1_001),
        format!("{}\n\n{}", "word ".repeat(250), "尾部".repeat(40)),
        format!("{}hello", " ".repeat(1_100)),
    ] {
        let chunks = bing_chunks(&text);
        let recovered: String = chunks
            .iter()
            .map(|(text, separator)| format!("{text}{separator}"))
            .collect();
        assert_eq!(recovered, text);
        assert!(chunks
            .iter()
            .all(|(text, _)| text.encode_utf16().count() <= 1_000));
    }
}

#[test]
fn bing_translates_all_chunks_preserves_the_separator_and_reuses_the_session() {
    let text = format!("{}\n\n{}", "a".repeat(990), "b".repeat(20));
    let server = Server::new(vec![
        Response::new(200, bing_page("test-token")),
        Response::new(200, bing_result("第一段")),
        Response::new(200, bing_result("第二段")),
    ]);
    let result = tauri::async_runtime::block_on(translator().bing_at_endpoint(
        &text,
        "zh-CN",
        &server.endpoint("/translator"),
    ))
    .unwrap();
    assert_eq!(result, "第一段\n\n第二段");
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 3);
    assert_eq!(requests[1].form()["text"], "a".repeat(990));
    assert_eq!(requests[2].form()["text"], "b".repeat(20));
}

#[test]
fn bing_separates_translations_after_a_forced_split() {
    let server = Server::new(vec![
        Response::new(200, bing_page("test-token")),
        Response::new(200, bing_result("First part")),
        Response::new(200, bing_result("Second part")),
    ]);
    let text = "中".repeat(1_001);
    let result = tauri::async_runtime::block_on(translator().bing_at_endpoint(
        &text,
        "en",
        &server.endpoint("/translator"),
    ))
    .unwrap();
    assert_eq!(result, "First part\nSecond part");
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests[1].form()["text"], "中".repeat(1_000));
    assert_eq!(requests[2].form()["text"], "中");
}

#[test]
fn bing_never_returns_a_partial_translation_after_a_later_chunk_fails() {
    let server = Server::new(vec![
        Response::new(200, bing_page("test-token")),
        Response::new(200, bing_result("第一段")),
        Response::new(500, "unavailable"),
    ]);
    let text = "中".repeat(1_001);
    let error = tauri::async_runtime::block_on(translator().bing_at_endpoint(
        &text,
        "en",
        &server.endpoint("/translator"),
    ))
    .unwrap_err();
    assert!(error.contains("HTTP 500"));
    assert!(!error.contains("第一段"));
}

#[test]
#[ignore = "contacts the real Google and Bing services with a fixed public sample"]
fn live_web_translation_smoke() {
    tauri::async_runtime::block_on(async {
        let service = WebTranslator::new().unwrap();
        let text = "Hello world.\nGood morning.";
        let results = [
            ("Google", service.google(text, "zh-CN").await),
            ("Bing", service.bing(text, "zh-CN").await),
        ];
        for (provider, result) in &results {
            println!("{provider}: {result:?}");
        }
        for (provider, result) in results {
            let result = result.unwrap_or_else(|error| panic!("{provider}: {error}"));
            assert!(result.contains('\n'), "{provider}: {result}");
            assert!(
                result
                    .chars()
                    .any(|ch| ('\u{4e00}'..='\u{9fff}').contains(&ch)),
                "{provider}: {result}"
            );
        }
    });
}
