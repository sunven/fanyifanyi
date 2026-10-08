# OCR fixture

`screenshot-ocr.png` is a synthetic 1394 × 152 RGB image of a long white English line on a black background, rendered with AppKit at 14 points. It contains no user screenshot data.

The URL-based Vision reader intermittently returned `TextRecognition.CRImageReaderError` code 1 on macOS 27.0.1 (26A434). The OCR adapter now loads encoded image bytes before invoking Vision. The test exercises the actual OCR command with a nontrivial selected region and checks recognized words. It requires macOS and the native Vision text recognition runtime.

Run: `cargo test --locked --lib recognizes_wide_screenshot_text_with_vision` from `src-tauri`.
