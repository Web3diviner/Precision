# Architecture migration status

## Implemented foundation

- Farm-scoped Firebase hierarchy: `farms/{farmId}/stands/{standId}`.
- Fixed six-node controller model: `NODE_01` through `NODE_06`.
- Shared TypeScript schemas for identifiers, telemetry and command payloads.
- Contract tests cover identifier parsing, complete telemetry, irrigation bounds, and fertigation payload completeness.
- Next.js dashboard foundation and direct Firebase Realtime Database subscription.
- Node history supports indexed 1-hour, 24-hour, 7-day, 30-day, and bounded custom date ranges, with an accessible moisture trend visualization when valid data is available.
- Express/Firebase Admin command API with token verification, role checks, online/staleness checks, stand-level conflict protection, expiry and audit writes.
- Command requests reject unknown Stands, missing or disabled Nodes, and duplicate Node targets before any queue record is written.
- Sensitive API routes support opt-in Firebase App Check verification; the web client automatically sends an attestation token when `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` is configured.
- API failures are surfaced as controlled `INTERNAL_ERROR` responses with structured server logging; command-lock cleanup cannot invalidate a successfully created operation.
- API CORS normalizes the configured dashboard origin list and permits only required methods and authorization headers.
- API responses are marked `Cache-Control: no-store` to avoid caching Farm telemetry, alerts, and operation records.
- `MAX_IRRIGATION_LITERS` is enforced by the API; set matching `NEXT_PUBLIC_MAX_IRRIGATION_LITERS` only to keep the browser’s input guidance in sync.
- Deny-by-default Firebase Realtime Database rules, with telemetry-only browser reads and controller-only command reads, plus a `measured_at` index.
- Both current and historical telemetry writes require every reading to contain a Boolean validity flag and a numeric-or-null value; controllers may update only command status/error fields after command creation.
- Controller status writes are restricted to valid forward transitions from `PENDING` through terminal completion or failure.
- Controller-reported operation failures mirror their error code and message into the operation history displayed to operators.
- Disabling a controller in `deviceRegistry` revokes its controller, current telemetry, history-log, Node-status, and command-status write access.
- A development seed with six correctly mapped Nodes and an explicitly offline controller.
- Retired root Firebase rule/config artifacts fail closed; `firebase.json` is the sole active Firebase deployment declaration.

## Deliberately not marked production-ready

- ESP32 still imports deprecated `Firebase_ESP_Client`; migration to `FirebaseClient` needs hardware bench validation against the exact sensor register map.
- No actuator pins, pump/valve drivers, flow calibration or emergency-stop interlocks are known; firmware remains fail-closed.
- Firebase Emulator rules/API tests and hardware bench validation are the next application milestones.
- Alert consumption and acknowledgement are implemented; controller-detected command failures generate immutable system alerts. Automated agronomic thresholds and outbound notifications still need a dedicated evaluation service.
- N/P/K engineering units remain TBC until the exact probe datasheet is verified.
