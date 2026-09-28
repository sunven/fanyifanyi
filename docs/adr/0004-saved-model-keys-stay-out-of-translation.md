# Saved model keys stay out of translation

Desk Translation and Screenshot Translation do not read or send a saved model key. The translation module passes the active provider, model id, base URL, and model name. When the provider is AI, the Rust command reads that model id from the file secret store. A missing key still reports that the key must be filled in first.

The settings module is the only reader that brings a saved key back. It does that so a model can be edited or revealed. An unsaved draft still goes to the model test with the key the user just typed. Direction policy stays in the translation module, as in ADR-0002. Key lookup stays on the secret-store seam.

## Considered Options

- Passing the saved key into the translation command: rejected because every translation would hand the stored key back across the seam.
- Loading the key into the translation module and then omitting it from the command: rejected because the key would still enter the webview.
- Keeping a synchronous cache in front of the settings module: rejected because that cache repeated the module's interface.
- Hiding keys from the settings editor as well: rejected because editing and revealing a key is the settings module's job.
