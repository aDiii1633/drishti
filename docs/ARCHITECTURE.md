# DRISHTI Architecture

## Runtime flow

```text
Answer sheet
  -> browser camera/upload OR ScanGate ESP32 capture
  -> Express/tRPC intake boundary
  -> validation and clarity metadata
  -> local storage adapter / external ScanGate image service
  -> stored answer-booklet pages
  -> Gemini evidence mapping (optional, when configured)
  -> Gemini rubric grading (optional, teacher remains final authority)
  -> evaluations and annotations
  -> admin assignment, evaluator review, re-check and QR verification
```

## Module boundaries

- `client/src/pages`: role workflows and presentation.
- `client/src/components`: shared shell, assistant and layout components.
- `server/routers.ts`: authenticated application procedures and authorization checks.
- `server/apiV1.ts`: intentionally small public health, AI-status and final-QR verification API.
- `server/filePayload.ts`: upload format and size validation.
- `server/storage.ts`: storage-key safety and local artifact persistence.
- `server/aiGrading.ts` and `server/gradeEngine.ts`: provider adapter and rubric/score validation.
- `server/hardwareScanner.ts`: ScanGate reviewer adapter and development test adapter.
- `server/scangateUsbAgent.ts`: DRISHTI server client for the loopback USB agent.
- `tools/scangate-usb-agent`: local serial transport, device handshake and frame transfer.
- `drizzle/schema.ts` and `drizzle/*.sql`: persistence model and migrations.

## Source of truth

The server and database are authoritative. UI polling refreshes authoritative queries every five seconds on operational pages. A QR is a signed locator, not a source of mutable paper metadata.

## Partial boundaries

The external ScanGate service owns its OpenCV quality pipeline and image endpoints. This repository consumes that contract; it does not duplicate or silently replace it. The external firmware owns GPIO, camera-board configuration, display, illumination and physical capture behavior.
