# Saved model keys stay out of translation

Desk Translation and Screenshot Translation do not read or send a saved model key. The translation module passes the active provider, model id, base URL, and model name. When the provider is AI, the Rust command reads that model id from the file secret store. A missing key still reports that the key must be filled in first.

The settings module is the only reader that brings a saved key back. It does that when the settings screen opens, so a model can be edited or revealed. An unsaved draft still goes to the model test with the key the user just typed. Direction policy stays in the translation module, as in ADR-0002. Key lookup stays on the secret-store seam.

Changing the translation provider or the active model writes metadata only. It does not read or write a saved key, and the settings screen does not reveal again afterwards. Adding, editing, or deleting a model touches only that model's secret: the draft key is stored, a cleared key is removed, and other models' secrets are not read back. Reset removes secrets by model id from the metadata and does not read their values. After each of these writes the settings screen patches the catalog it already holds. Deleting the active model returns the new active model id. A full replacement save remains for legacy migration, because that record already holds the keys. Everyday writes do not use it.

## Considered Options

- Passing the saved key into the translation command: rejected because every translation would hand the stored key back across the seam.
- Loading the key into the translation module and then omitting it from the command: rejected because the key would still enter the webview.
- Keeping a synchronous cache in front of the settings module: rejected because that cache repeated the module's interface.
- Hiding keys from the settings editor as well: rejected because editing and revealing a key is the settings module's job.
- Hydrating every key on a provider or active-model change, then writing them all back: rejected because those writes are not edit or reveal.
- Reloading every key after each catalog change: rejected because the screen already holds the keys it revealed on open.
- Reading secret values in order to delete or reset them: rejected because the metadata already has the model ids.
- Removing the full replacement save: rejected because legacy migration already holds the keys and still needs to store them once.

## Consequences

- Tests that a provider or active-model change does not read secrets, and that add, edit, delete, and reset touch only one model id, live on the settings catalog. The settings screen tests keep the visible outcome and do not count secret reads.
- Translation still does not receive a saved key.
