# fanyifanyi

This context defines the product language for fanyifanyi's translation and dictionary workflows.

## Language

**Desk Translation**:
Translation of text the user typed, between Chinese and English, shown in the translation result area.
_Avoid_: input translation, manual translation, text-box translation

**Screenshot Translation**:
A workflow where the user selects an arbitrary English region on the screen and sees the Chinese translation in a reading overlay near the selected region.
_Avoid_: image translation, preview translation, OCR-only translation

**Selection Toolbar**:
A small control surface shown next to a selected screen region before Screenshot Translation starts.
_Avoid_: preview dialog, confirmation page

**Translation Overlay**:
A reading surface shown after OCR and translation finish. It keeps the selected bounds when readable, expands when needed, and allows switching between scrollable Chinese translation and the captured original region without losing the translation reading position.
_Avoid_: result panel, copied text, app preview, line-by-line image translation

**Dictionary**:
The lookup beside Desk Translation: senses, phrases, and synonyms for a word the user typed.
_Avoid_: dict, word lookup, Youdao result
