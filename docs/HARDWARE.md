# DRISHTI Hardware Boundary

## Supported integration contract

The local agent expects a ScanGate ESP32-S3 device over CH343 USB-UART, performs device identity and camera-readiness checks, and uses 921600 baud for the binary JPEG path. It transfers two frames with declared lengths, CRC32, ACK/NACK, bounded timeouts/retries and stable capture ids.

Expected local setup for the previously identified device is COM17 and VID:PID `1A86:55D3`, but these identifiers alone never mean the device is ready. The agent must complete its handshake and report the expected identity and camera availability.

## External responsibilities

The ScanGate firmware/service owns the camera GPIO map, Nextion UART/display protocol, LED strips, MOSFET switching, physical capture button, camera initialization and its OpenCV quality pipeline. No such source is present in this repository, so no GPIO or power assumption is changed here.

## Current verification

The 2026-08-28 local serial-port probe did not return COM17. Therefore the physical capture path is `PARTIAL`, not certified. Verify the device with the commands in `docs/SCANGATE_USB_AGENT_SETUP.md` after reconnecting the board.
