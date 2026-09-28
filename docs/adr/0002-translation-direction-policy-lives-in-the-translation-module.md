# Translation direction policy lives in the translation module

Desk Translation and Screenshot Translation share one translation module. That module owns the direction policy: the prompt, and whether the target language is chosen from the text or fixed to Chinese. The Rust commands are adapters for the AI, Google, and Microsoft engines. They receive an already built prompt or a target language, and they do not choose the direction.

Policy stays in the module so a direction change has one locality. The engines stay behind the existing Tauri seam. This follows ADR-0001: local OCR remains outside the module, and recognized text then goes through the one translation module.

## Considered Options

- Direction policy inside the Rust commands, with the module only forwarding the workflow and credentials: rejected because the module would be a shallow dispatch.
- AI prompts in Rust and Google or Microsoft target languages in the module: rejected because one direction decision would leak across the seam.
- Hiding model key lookup inside this module: rejected because key storage is a separate seam, with a file adapter and an in-memory adapter already.
