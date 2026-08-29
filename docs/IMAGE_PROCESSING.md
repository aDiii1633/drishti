# DRISHTI Image Processing

What this document describes is what the repository actually executes. Stages
that DRISHTI does not implement are listed under "Not implemented here" and are
never presented as working.

## Stage map

```
FILE CHOSEN / CAPTURED   (browser, or ScanGate hardware)
        |
   [1] RENDER + CLARITY GATE      client/src/lib/pdf.ts        (browser)
        |
   [2] TRANSPORT                  tRPC bundles.create / appendCapture
        |
   [3] DECODE + VALIDATE          server/filePayload.ts        (server)
        |
   [4] STORE                      server/storage.ts            (server)
        |
   [5] SERVE                      server/_core/storageProxy.ts (server)
        |
   [6] EVIDENCE SELECTION         server/routers.ts storedAnswerPages
        |
   [7] GRADING                    server/aiGrading.ts          (Gemini)
```

### [1] Render and clarity gate - browser

`checkPdfClarity` renders each PDF page with pdf.js onto a canvas, then measures
sharpness with `varianceOfLaplacian`: a 4-neighbour Laplacian over the luminance
channel (`0.299R + 0.587G + 0.114B`), reported as the variance of that response.

- Analysis is done on a separate canvas fixed at `1.15x` the page's base
  viewport, so the threshold stays calibrated regardless of the evidence
  resolution. The evidence image itself is rendered at up to `2.25x` (capped at
  1600px wide) and stored as JPEG quality `0.86`.
- Threshold: `variance < 150` is `BLURRY`, otherwise `CLEAR`.
- `checkImageClarity` applies the same measure and threshold to a single
  uploaded replacement image, at its natural resolution.

The threshold is an empirical intake gate, not a calibrated optical measurement.
`docs/CAMERA_FOV_CALIBRATION.md` covers the capture-side geometry separately.

### [2] Transport

Pages travel as base64 data URLs inside the tRPC payload. Express is configured
with a 50 MB body limit (`server/_core/index.ts`), and the per-field Zod schemas
bound each page and file independently.

### [3] Decode and validate - server

`decodePdfUpload` and `decodeImageDataUrl` are the trust boundary. They:

- reject anything that is not well-formed base64,
- enforce size limits before and after decoding (24 MB PDF, 10 MB image),
- verify **magic bytes**, not the declared type - `%PDF-` for PDFs, the 8-byte
  PNG signature or the `FF D8 FF` JPEG marker for images,
- reject a file whose bytes contradict its declared MIME type,
- discard the client-supplied filename and rebuild a safe one through
  `sanitizeStorageFileName`.

### [4] Store

`storagePut` writes to `local-storage/<key>` under the project root. Keys are
normalised (`normalizeKey`) and re-checked against the storage root so no key can
escape it; a random 8-character suffix prevents collisions and guessing. The
content type is recorded in a `.meta.json` sidecar rather than inferred later.

### [5] Serve

`GET /manus-storage/*` streams the file, setting `Cache-Control: no-store` and
the recorded content type. Traversal attempts are rejected with 400. Verified on
2026-08-29 over a raw socket (an HTTP client that normalises the URI collapses
`../` before sending and therefore does not exercise this route).

**Known limit:** this route is not authenticated. Anyone who knows a storage key
can fetch that object. Keys contain a random suffix and are only handed to
authorised sessions, so this is obscurity, not authorization. Placing the route
behind the role session is the correct fix before any public deployment.

### [6] Evidence selection

`storedAnswerPages` reads `pageChecks` rows that carry an image `pageDataUrl` and
orders them by page number for the marking workspace and the grader.

### [7] Grading

`server/aiGrading.ts` sends page images to Gemini as **inline base64**
(`inlineData`), so grading does not require DRISHTI to be publicly reachable.
Responses are schema-validated with Zod and retried on an invalid score rather
than being persisted. See `DRISHTI_AI_PIPELINE.md`.

## Where clarity is actually decided

`clarity` and `laplacianVariance` are computed **in the browser** and accepted by
the server as input (`z.enum(["CLEAR","BLURRY"])`, `z.number().int().nonnegative()`).
The server validates their *shape*, not their *truthfulness*.

A modified client can therefore report `CLEAR` for a blurry page. The practical
consequence is a poor-quality scan entering evaluation, where a human evaluator
sees the image before awarding marks. It is not a path to changing anyone's
marks. Treat the clarity gate as an operator aid, not a security control. Moving
the measurement server-side would require a server image decoder, which this
repository deliberately does not carry (see below).

## Not implemented here

None of the following exist in this repository. Do not describe them as working.

- **Handwriting OCR.** There is no OCR engine. `marking.startOcr` / `pollOcr`
  drive the Gemini vision path, not a text-recognition pipeline.
- **Perspective correction / deskew / dewarping.** No homography or corner
  detection.
- **Document boundary detection and auto-cropping.**
- **Server-side enhancement** - no OpenCV, no `sharp`, no binarisation,
  denoising, or contrast normalisation on the server.
- **Server-side blur verification** (see the section above).

Where an enhanced image exists, it was produced by the **external ScanGate
service**, not by this repository. `server/hardwareScanner.ts` consumes the
`original` and `enhanced` buffers that service returns and never generates them.

## Future hardware capture

The hardware path is already an interface, not a dependency. A provider
implements `HardwareScannerProvider` (`status`, `arm`, `findNextCapture`) and
returns a `HardwareCapture`. Captured frames rejoin this document at stage [3]
with identical validation and storage. Nothing in stages [3]-[7] needs to change
when physical capture is connected. See `docs/HARDWARE.md`.
