# ScanGate camera FOV calibration

## Measured hardware state

Measured on 2026-08-23 from the connected ScanGate device on COM17.

| Item | Measured value |
| --- | --- |
| USB bridge | CH343, VID:PID `1A86:55D3` |
| Device identity | `ScanGate` / `SCANGET-01` |
| Hardware | ESP32-S3-N1-S R8 |
| Firmware | v4 |
| Camera status | available |
| Sensor configured by firmware | OV3660 (`PID 0x3660`) |
| USB baud rate | 921600 |
| Raw preview JPEG | 2048 × 1536 |
| Raw preview aspect ratio | 4:3 |
| Capture mode | QXGA, 2048 × 1536, JPEG quality 8 |
| Browser preview measured | 862 × 646 at a 1280 px desktop viewport |
| Browser image fit | `contain`, centered |
| Real USB pipeline capture | `fov-audit-20260823-01` |
| Pipeline result | `CHOP` / `PAGE CUT - ALIGN` |
| USB capture-to-result time | approximately 9.3 seconds |

The raw test frame is stored locally at:

`D:\drishti\.artifacts\camera-fov\esp32-preview-raw.jpg`

The raw JPEG and the browser preview show the same complete 4:3 region. The
frontend no longer applies a separate crop to the hardware image.

The real two-frame capture completed over USB, passed through the existing
ScanGate ingestion and OpenCV pipeline, and correctly rejected the current
physical framing as `CHOP`. This verifies that the crop warning is based on the
sensor content rather than a frontend preview mask.

## Physical finding

The measured raw frame already cuts through the photographed paper and the text
is rotated relative to a portrait answer sheet. This cannot be recovered by CSS.
The camera mount, paper position, and working distance must be adjusted until all
four A4 edges are present in the raw JPEG. Do not rotate or zoom the browser image
to hide this condition.

The exact lens model and lens FOV are not available from the inspected firmware.
No FOV number is claimed.

## Developer calibration mode

In development, open:

`http://localhost:3002/scanner?cameraCalibration=1`

Choose Hardware and expand **Developer FOV calibration** below the preview.
Measure and enter:

1. Camera-to-paper-plane distance in millimetres.
2. Total visible scene width in millimetres.
3. Total visible scene height in millimetres.
4. The A4 orientation used by the physical rig.

The tool calculates approximate horizontal and vertical FOV using:

`FOV = 2 × atan(scene coverage / (2 × camera distance))`

It stores the calibration locally and sizes the A4 guide from the measured scene
coverage. The guide remains an overlay; it never crops the camera image.

## Completion criteria for physical calibration

- Place a flat A4 sheet at the final working plane.
- Keep the camera and paper parallel.
- Adjust distance until all four edges have comfortable margin in the raw frame.
- Confirm the raw frame is correctly oriented at the mount.
- Record distance and full visible scene coverage in the developer tool.
- Capture a real two-frame burst and confirm ScanGate does not return `CHOP`.
- Compare original and enhanced outputs and confirm both retain all four edges.
