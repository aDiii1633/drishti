# DRISHTI Firmware Status

## Status: NOT IMPLEMENTED HERE

No ESP32 firmware source, board profile, `platformio.ini`, Arduino project, Nextion assets, GPIO definitions or flashing script exists under this repository. The local USB agent defines and consumes a serial protocol; it is not firmware.

## Required external evidence before firmware changes

Obtain the authoritative ScanGate firmware repository and wiring contract. Verify board revision, camera module, UART ownership, display pins, LED/MOSFET pins, power rails, capture-button behavior, watchdog behavior and trusted-host configuration before flashing. Do not infer or change GPIO assignments from this application repository.

## Current protocol assumptions

The agent uses the existing ScanGate packet contract documented in `docs/SCANGATE_USB_AGENT_SETUP.md`. Any firmware update must remain compatible with the `SG01` framing, protocol version, packet types, frame CRCs and device-info handshake, or update both sides with a tested versioned contract.
