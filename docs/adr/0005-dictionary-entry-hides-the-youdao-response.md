# The dictionary module hides the Youdao response

Dictionary turns the Youdao response into one entry: the typed headword, US pronunciation, forms, senses, phrases, synonyms, and related words. The Rust command remains the fetch adapter and still returns the response unchanged. The dictionary surface paints loading, failure, an empty prompt, and the not-found line. It does not see Youdao paths.

A response with no headword entry is not found. A sense, phrase, synonym, or related word that lacks its text is skipped, and the list may be empty. A sense with no space is the whole meaning and has no part of speech. A fetch or JSON failure stays a failure. Exam tags are not part of the entry, because the surface does not show them.

## Considered Options

- Parsing the response in the Rust command: rejected because the entry is for the dictionary surface, and the command would then own a display concern.
- Letting each tab read its own Youdao path: rejected because a response change has no single locality, and tests never see the whole entry.
- Failing the lookup when one phrase or sense is incomplete: rejected because a missing row is not a failed lookup.
- Keeping the no-space sense slice that drops the last character: rejected because that is an accident, not a reading of the text.
- Adding exam tags to the entry: rejected because the surface does not show them, and this change does not add a new field.

## Consequences

- Tests for the response-to-entry reading live on the dictionary module, using fixture JSON. The surface does not grow a second set of path tests.
- No new fetch seam. The existing command stays the adapter.
