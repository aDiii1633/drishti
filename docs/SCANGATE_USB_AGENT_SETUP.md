# ScanGate USB Device Agent

## Scope

The local USB agent owns the ScanGate USB-UART capture transport for DRISHTI Hardware mode. It
verifies the ESP32 identity before exposing it as ready, receives the two QXGA JPEGs over USB,
checks every declared length and CRC32, then sends the frames to the existing ScanGate OpenCV
pipeline through a loopback-only endpoint.

Camera and Upload scanner modes are unchanged. This service neither exposes images to the browser
nor creates another processing pipeline.

## Board Interface

The ESP32-S3-N1-S R8 uses its existing CH343 USB-UART connection at 921600 baud. Native USB CDC
stays disabled (`ARDUINO_USB_CDC_ON_BOOT=0`). Do not connect both board USB sockets as power
sources at the same time.

The binary frame is:

```
SG01 | version | type | frame number | capture-id length | payload length | CRC32 | capture id | payload
```

JPEGs use 4096-byte `FRAME_DATA` chunks. Every chunk is acknowledged, every frame ends with a
CRC32 check and `FRAME_VALID`, and the firmware retries a failed frame a bounded number of times.
`capture_id` stays unchanged across retries, so the ScanGate backend's existing idempotency record
is reused.

## Firmware Update

The firmware is in:

`C:\Users\adity\AppData\Local\Temp\scangate-inspect\firmware\esp32s3_cam`

The agent uses `PING`, `GET_DEVICE_INFO` and `STATUS` before it can report a connection. It also
supports `CAPTURE`, `ACK`, `NACK`, `FRAME_VALID`, `STOP`, and `RESET`. The device must report:

- `device`: `ScanGate`
- `hardware`: `ESP32-S3-N1-S R8`
- `camera`: `available`
- the configured `SG_DEVICE_ID`

COM17 and VID:PID `1A86:55D3` only narrow discovery. They never satisfy the handshake on their
own.

## Start the Local Services

Start the existing ScanGate backend on loopback:

```powershell
Set-Location C:\Users\adity\AppData\Local\Temp\scangate-inspect\backend
$env:SCANGET_USB_AGENT_TOKEN = "<32+ character local secret>"
py -3 -m uvicorn scanget_backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, start the USB agent:

```powershell
Set-Location D:\drishti
$env:SCANGATE_USB_EXPECTED_DEVICE_ID = "SCANGET-01"
$env:SCANGATE_USB_EXPECTED_VID_PID = "1A86:55D3"
$env:SCANGATE_USB_PORT = "COM17"
$env:SCANGATE_USB_BAUD_RATE = "921600"
$env:SCANGATE_USB_INGEST_URL = "http://127.0.0.1:8000/api/v1/captures/usb"
$env:SCANGATE_USB_INGEST_TOKEN = "<same 32+ character local secret>"
pnpm scangate:usb-agent
```

The agent binds only to `http://127.0.0.1:57931`. Its useful endpoints are:

```powershell
Invoke-RestMethod http://127.0.0.1:57931/health
Invoke-RestMethod http://127.0.0.1:57931/device/status
Invoke-RestMethod http://127.0.0.1:57931/device/info
Invoke-RestMethod -Method Post http://127.0.0.1:57931/device/ping
```

For real DRISHTI Hardware mode, configure `APP_MODE=real` together with the existing reviewer
API values, `SCANGATE_USB_AGENT_URL`, and the same expected device ID. DRISHTI sends the
QR-verified paper id, page number, and capture id to the agent; it continues to retrieve accepted
original and enhanced images through the existing reviewer API before it persists the answer sheet.

## States

`DISCONNECTED` means no matching USB serial device exists. `CONNECTING` and `CONNECTED` mean a
candidate is being verified. `READY` requires device identity, camera readiness, and firmware
state to pass. `CAPTURING` and `PROCESSING` describe a real two-frame transport and the existing
OpenCV pipeline. `ERROR` means handshake, transfer, or local ingestion failed closed.

## Ingestion Boundary

`POST /api/v1/captures/usb` accepts `capture_id`, `page_number`, `booklet_ref`, `frame_0`, and
`frame_1`. It is bound to the local backend and independently enforces a loopback peer, a
per-installation USB-agent token, and the device identity received over UART. It delegates to the
same `pipeline.process` function as `/api/v1/captures/burst`.
