# The Screenshot Translation session owns the window handoff

Screenshot Translation keeps two handoffs: the selection window receives the capture through query fields, and the Translation Overlay receives its text through local storage. Both stay inside the session module. Callers start a capture, submit a CSS rectangle, discard the capture, or read the overlay text. They do not see scale, physical size, logical origin, storage keys, or label prefixes.

The rectangle operation turns that CSS rectangle into a physical image region, asks the OCR adapter for text, runs Screenshot Translation, opens the Translation Overlay, and discards the capture file. Vision's Y-axis flip stays in the OCR adapter, on the screenshot-to-text seam from ADR-0001. A change to how a selection becomes an overlay has one locality.

## Considered Options

- One channel for both windows, either all query fields or all local storage: rejected because the existing handoff is not what has been breaking.
- Exporting the scale conversion and the overlay rectangle as their own operations: rejected because tests would keep missing the join, and the selection window would still learn physical coordinates.
- Moving Vision's Y-axis flip into the session: rejected because the OCR adapter owns Vision's coordinate space.
