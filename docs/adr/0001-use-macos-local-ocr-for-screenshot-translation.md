# Use macOS Local OCR for Screenshot Translation

Screenshot Translation will start on macOS and use local OCR before sending recognized text through the existing text translation engine. This avoids requiring vision-capable AI models and avoids uploading screenshots, while keeping later Windows and Linux OCR paths possible behind the same screenshot-to-text boundary.

The first tracer bullet is intentionally narrow: it is launched from the app button, has no global shortcut, captures the display containing the cursor, and does not support cross-display selections.

The app now also starts this same Screenshot Translation session from a configurable macOS global shortcut (Control + Option + T by default). The shortcut works while the app is running, including when the main window is in the background or minimized; it does not add menu-bar residency. An existing selection is focused instead of creating another one. Local OCR and the single-display boundary remain the same.

## Considered Options

- AI vision OCR and translation in one request: rejected for the first version because it depends on model capability and sends screenshots off-device.
- Cross-platform OCR from day one: rejected for the first version because each desktop platform has different capture, permission, and overlay constraints.
