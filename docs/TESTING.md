# DRISHTI Testing and Validation

## Automated gates

```powershell
pnpm check
pnpm test
pnpm build
```

The repository suite covers auth, role authorization, QR signing, upload validation, storage safety, scanner adapters, demo lifecycle, evaluation validation, annotations, re-checks and admin metrics. External-provider tests are skipped when their credentials are absent.

## Hardware validation

1. Confirm `SerialPort.list()` returns the expected USB device.
2. Start the external ScanGate service and local USB agent.
3. Verify `/health`, `/device/status`, `/device/info` and `POST /device/ping`.
4. Confirm identity, camera readiness and 921600-baud two-frame transfer.
5. Capture a real frame, confirm the external quality result, then verify original/enhanced artifacts and DRISHTI bundle persistence.

## Manual UI smoke flow

Run the application and check role selection, each role login, QR-first scanner intake, multi-image upload, camera fallback, hardware failure states, evaluator assignment, marking/annotation, finalization, public QR verification and student re-check. Repeat at desktop and mobile widths and check for horizontal overflow.

## Release truth

Do not mark OCR, semantic handwriting grading, firmware, display, LED/MOSFET control or physical camera capture as working unless the corresponding external service/device test has actually passed.
