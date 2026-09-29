# The Screenshot Translation session owns the window handoff

Screenshot Translation keeps two handoffs: the selection window receives the capture through query fields, and the Translation Overlay receives its text through local storage. Both stay inside the session module. Callers start a capture, reveal the selection window, submit a CSS rectangle, cancel, discard the capture, or read the overlay text. They do not see scale, physical size, logical origin, storage keys, or label prefixes. They do not show, focus, or destroy the selection window.

The rectangle operation turns that CSS rectangle into a physical image region, asks the OCR adapter for text, runs Screenshot Translation, opens the Translation Overlay, and discards the capture file. On success it then destroys the selection window. On failure it leaves the selection window up and lets the failure through. The session does not choose the words for that failure. Vision's Y-axis flip stays in the OCR adapter, on the screenshot-to-text seam from ADR-0001. A change to how a selection becomes an overlay has one locality.

The session also owns the lifetime around that handoff. Reveal runs from the selection window, because only that window can tell that it is visible: show the selection window, show the app window, then focus the selection window. Cancel discards the capture, destroys the selection window, and voids a submit that has not yet opened the Translation Overlay. A submit that has already opened the overlay is not rolled back. Closing the app window destroys selection windows and Translation Overlays before the app window itself. The app window only binds and unbinds that close. The Translation Overlay still closes itself. The selection surface only draws the rectangle, the Selection Toolbar, loading, and a reported failure. A rectangle too small to offer the toolbar is simply not submitted; the session does not reject it. There is no separate window seam. The session calls platform windows directly.

Desk Translation remains the name for typed translation. The app window is not Desk Translation.

## Considered Options

- One channel for both windows, either all query fields or all local storage: rejected because the existing handoff is not what has been breaking.
- Exporting the scale conversion and the overlay rectangle as their own operations: rejected because tests would keep missing the join, and the selection window would still learn physical coordinates.
- Moving Vision's Y-axis flip into the session: rejected because the OCR adapter owns Vision's coordinate space.
- Leaving show, focus, and destroy in the selection surface: rejected because the flash, the overlay lifetime, and the loading state each had to be fixed in a different caller.
- A new window seam with a platform adapter and a test adapter: rejected because callers would learn another interface, and the platform fake already sits inside the session tests.
- Letting a submit finish after cancel and still open the Translation Overlay: rejected because that join is where a late result leaks out of the session.
- Rolling back a Translation Overlay that cancel lost the race to: rejected because the overlay is already the result the user is reading.
- Teaching the session the toolbar's minimum size: rejected because that threshold only decides whether the Selection Toolbar is drawn.

## Consequences

- Tests for reveal order, destroy on success, keeping the window on failure, cancel voiding an in-flight submit, and app-window close live on the session. The selection surface tests loading, painting a reported failure, and that Escape cancels. The app window tests only that close is bound and unbound. The Translation Overlay size tests stay where they are.
- No new glossary entry. The session module keeps its name in this ADR.
