# DRISHTI Technical Stack

## Current

- TypeScript 5.9, Node.js runtime, pnpm.
- React 19 client compiled by Vite 7. The application is not a Next.js app despite some generated project metadata.
- Express 4 serves the API and the Vite development middleware or production static bundle.
- Wouter provides client routing; tRPC provides typed application procedures.
- Drizzle ORM with SQLite/libSQL schema and SQL migrations.
- Local filesystem storage behind the existing `/manus-storage/*` proxy boundary.
- Gemini REST API for optional server-side question-first evidence mapping and rubric-bound grading.
- `serialport` for the local ScanGate ESP32 USB-UART bridge.
- Vitest and Playwright packages are available; the committed automated suite is primarily Vitest.

## Component conventions

The repository uses shadcn-style components under `client/src/components/ui`, Tailwind CSS v4 through the Vite plugin, and the alias `@/*` to `client/src/*`. The canonical utility is `client/src/lib/utils.ts`. New UI components should reuse this structure rather than creating another component system.

## Explicitly not present

There is no in-repository firmware toolchain, OpenCV package, OCR engine, message queue, WebSocket service, Kubernetes configuration, or separate microservice deployment. Those must not be described as current capabilities.
