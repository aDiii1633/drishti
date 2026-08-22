# DRISHTI x ScanGate hardware setup

## Purpose and boundary

DRISHTI remains the examination platform. ScanGate remains the ESP32-S3 capture and image-quality service.

The DRISHTI Scanner workspace keeps its existing Camera and Upload modes. Hardware is a third mode. DRISHTI resolves the examination paper from its QR, then reads a ScanGate capture through a server-side gateway. The browser never receives a ScanGate reviewer token or a device key.

## Network requirements

The ScanGate backend must be reachable from the DRISHTI server at `SCANGATE_BASE_URL`. Use HTTPS for the physical device deployment. The ScanGate repository explicitly does not support insecure HTTP on the ESP32-S3.

Keep the ScanGate backend and its private image storage on a trusted network. Do not expose its data directory or reviewer endpoints to the browser.

## Configuration

Set these in DRISHTI's server environment:

```dotenv
SCANGATE_BASE_URL=https://scangate.example.internal
SCANGATE_REVIEWER_TOKEN=<ScanGate reviewer bearer token>
SCANGATE_STATION_CODE=<station assigned to this DRISHTI desk>
```

`SCANGATE_ADAPTER=mock` is permitted only outside production for software testing. In development demo mode, the test adapter is selected automatically. A real deployment must not set the mock adapter.

These values belong to ScanGate firmware or the ScanGate backend, not the DRISHTI browser or DRISHTI environment:

```text
SCANGATE_DEVICE_ID
SCANGATE_DEVICE_KEY
DEVICE_IP / HOSTNAME
```

Configure them in ScanGate's `device_config.h` and backend environment using the actual ScanGate documentation. Do not copy `SCANGATE_DEVICE_KEY` into a client variable, URL, log, or QR payload.

## ScanGate configuration

Follow ScanGate's `CONTRACT.md` and `backend/README.md` from commit `e4587f1`:

1. Set the ScanGate backend's device ID, device key, station code, reviewer token, data directory, TLS hostname, and allowed hosts.
2. Configure the ESP32-S3 firmware with the same device ID, device key, station code, HTTPS host, port, path, and trusted root CA.
3. Keep `SG_API_PATH` set to `/api/v1/captures/burst`.
4. Set the optional `SG_PAGE_NUMBER` and `SG_BOOKLET_REF` only when the installed device is dedicated to that physical paper configuration. They are opaque references, never student information.
5. Start ScanGate, then verify `GET /healthz` from the DRISHTI server network.

Do not invent wiring or pin settings. ScanGate owns the physical button, LEDs, camera board configuration, and two-frame burst firmware.

## DRISHTI scanner flow

1. Sign in to the Scanner desk and choose Hardware.
2. Confirm the scanner service is ready.
3. Scan a registered DRISHTI bundle QR. The QR resolves the session, subject, paper, set, bundle, and marking scheme.
4. Select **Arm scanner**. DRISHTI stores a short-lived, server-side cursor for the configured ScanGate station.
5. Frame the physical page and press the ScanGate device's physical capture button.
6. ScanGate captures its exact two-frame JPEG burst, performs its quality pipeline, and stores accepted original and enhanced JPEGs.
7. DRISHTI reads the next station capture using the ScanGate reviewer API. Rejected scans remain rejected and never create a DRISHTI answer sheet.
8. For an accepted scan, DRISHTI displays the enhanced preview. Select **Store answer sheet**, then submit it into the existing evaluation queue.

The enhanced image becomes the working answer-booklet source. DRISHTI stores the untouched original as a `scanOriginal` document artifact for audit. ScanGate capture ID, device, station, and physical `page_number` are retained through the existing capture-device field, document names, idempotency session, and audit event. A newly stored DRISHTI bundle always begins at viewer page 1, so an appliance-specific ScanGate page number cannot create gaps in the evaluation viewer.

## Connection and failure states

| DRISHTI state                | Meaning                                                                                    | Operator action                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Hardware scanner unavailable | DRISHTI cannot reach or use the configured ScanGate gateway.                               | Retry connection, or use Camera / Upload.           |
| Ready                        | ScanGate service responded and the station is armed.                                       | Press the physical capture button.                  |
| Scan accepted                | ScanGate returned `OK`; original and enhanced images are available.                        | Review, store, then submit.                         |
| Retake required              | ScanGate returned `BLUR`, `CHOP`, or `GLARE`.                                              | Correct the page, focus, or lighting and arm again. |
| Scanner error                | ScanGate returned `SYSTEM_ERROR` or the integration could not safely retrieve the capture. | Retry after checking the scanner service.           |

Raw ScanGate errors, credentials, scan IDs, paths, and technical metrics are never shown in the scanner UI.

## Testing without a physical device

In development demo mode, Hardware exposes **Development test capture** only after a QR is verified and the scanner is armed. It exercises server-backed states for accepted, blur, crop, glare, and system-error results. It is not available in production and never replaces the ScanGate provider.

The test adapter allows this full DRISHTI path to be exercised:

```text
Hardware -> QR -> arm -> test capture -> quality decision -> preview
-> store answer sheet -> submit -> admin/evaluator queue
```

## Real integration verification

With real configuration, verify the following from the DRISHTI server network:

1. `GET $SCANGATE_BASE_URL/healthz` returns `{"ok": true}`.
2. The configured reviewer token can list the configured station through `GET /api/v1/reviewer/captures?station_code=...`.
3. Scan a DRISHTI QR, arm the scanner, press the physical button, and confirm ScanGate returns an `OK` capture.
4. Confirm DRISHTI shows the enhanced preview, creates one hardware bundle after storage, and preserves both `answerBooklet` and `scanOriginal` documents.
5. Submit the bundle and confirm it is visible for admin assignment and evaluator review.

## ScanGate contract constraint

The inspected ScanGate firmware captures only on its physical button. Its current API has no DRISHTI command endpoint to trigger a burst, reserve a capture ID, or set a dynamic `booklet_ref`. DRISHTI therefore arms a station cursor and consumes the next capture for that station after the QR is verified.

Until ScanGate adds an authenticated capture-session/reservation API, assign one physical ScanGate station to one active DRISHTI scanner desk at a time. This avoids competing operators claiming the same next hardware capture. DRISHTI intentionally does not alter ScanGate firmware or invent unsupported endpoint calls.
