# Architecture migration status

## Implemented foundation

- Farm-scoped Firebase hierarchy: `farms/{farmId}/stands/{standId}`.
- Fixed six-node controller model: `NODE_01` through `NODE_06`.
- Shared TypeScript schemas for identifiers, telemetry and command payloads.
- Contract tests cover identifier parsing, complete telemetry, irrigation bounds, and fertigation payload completeness.
- Next.js dashboard foundation and direct Firebase Realtime Database subscription.
- A route-level dashboard recovery boundary prevents unexpected client rendering failures from leaving operators on a blank page and makes clear that no operation was created.
- The authenticated dashboard selects from the operator's authorized Farms and their API-authorized Stands rather than assuming a fixed `FARM_001` / `STAND_01` deployment.
- The development topology now includes two Farms with two named Stands each; every Stand owns its own offline controller record and independent six-Node Modbus address space.
- A safe Firebase Admin provisioning command expands development capacity to 10 Farms × 10 Stands × 6 Nodes, only creating missing Farm/Stand records so it cannot reset provisioned controllers or telemetry.
- Farm/Stand discovery API responses are minimized to metadata and controller summaries; controller-only command queues and operation payloads are never returned for selector use.
- Node history supports indexed 1-hour, 24-hour, 7-day, 30-day, and bounded custom date ranges, with an accessible moisture trend visualization when valid data is available.
- Express/Firebase Admin command API with token verification, role checks, online/staleness checks, stand-level conflict protection, expiry and audit writes.
- Command requests reject unknown Stands, missing or disabled Nodes, and duplicate Node targets before any queue record is written.
- Sensitive API routes support opt-in Firebase App Check verification; the web client automatically sends an attestation token when `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` is configured.
- API failures are surfaced as controlled `INTERNAL_ERROR` responses with structured server logging; command-lock cleanup cannot invalidate a successfully created operation.
- API responses carry a correlation ID, while structured request logs record the method, route, status, latency, authenticated UID when available, and command creation context.
- API CORS normalizes the configured dashboard origin list and permits only required methods and authorization headers.
- Local web fallbacks and the environment template consistently target the API's default `http://localhost:4000` address.
- API responses are marked `Cache-Control: no-store` to avoid caching Farm telemetry, alerts, and operation records.
- Every irrigation or fertigation request is reviewed in the dashboard and requires an explicit second confirmation before the API creates a queued command.
- `MAX_IRRIGATION_LITERS` is enforced by the API; set matching `NEXT_PUBLIC_MAX_IRRIGATION_LITERS` only to keep the browser’s input guidance in sync.
- Deny-by-default Firebase Realtime Database rules, with telemetry-only browser reads and controller-only command reads, plus a `measured_at` index.
- Both current and historical telemetry writes require every reading to contain a Boolean validity flag and a numeric-or-null value; controllers may update only command status/error fields after command creation.
- Controller status writes are restricted to valid forward transitions from `PENDING` through terminal completion or failure.
- Controller-reported operation failures mirror their error code and message into the operation history displayed to operators.
- Controllers record immutable receipt, start, and completion timestamps on each command; those writes require an enabled matching device registry entry.
- Controller state transitions also append immutable, registry-bound audit events, covering execution, completion, expiry, and failure.
- Disabling a controller in `deviceRegistry` revokes its controller, current telemetry, history-log, Node-status, and command-status write access.
- A development seed with six correctly mapped Nodes and an explicitly offline controller.
- Automated checks keep the development seed constrained to `NODE_01`–`NODE_06`, unique Modbus addresses 1–6, enabled Node metadata, and a fail-safe offline controller state.
- Retired root Firebase rule/config artifacts fail closed; `firebase.json` is the sole active Firebase deployment declaration.
- GitHub Actions verifies clean dependency installation, workspace type checks, contract/security tests, and production builds on pull requests and `main`.
- Firebase Emulator UI is assigned port `4001` to avoid the local API on port `4000`; the Render blueprint is configured for automatic deployment.
- Core runtime packages are current on Next.js 16, Firebase Web 12, and Firebase Admin 14; the web production build, API build, contract/security tests, and type checks pass on that upgraded stack.

## Deliberately not marked production-ready

- ESP32 still imports deprecated `Firebase_ESP_Client`; migration to `FirebaseClient` needs hardware bench validation against the exact sensor register map.
- No actuator pins, pump/valve drivers, flow calibration or emergency-stop interlocks are known; firmware remains fail-closed.
- Firebase Emulator rules/API tests and hardware bench validation are the next application milestones.
- Alert consumption and acknowledgement are implemented; controller-detected command failures generate immutable system alerts. Automated agronomic thresholds and outbound notifications still need a dedicated evaluation service.
- N/P/K engineering units remain TBC until the exact probe datasheet is verified.
- Registry audit still reports two moderate transitive `uuid` findings in the Google Admin client chain; npm did not provide a safe automatic remediation.
