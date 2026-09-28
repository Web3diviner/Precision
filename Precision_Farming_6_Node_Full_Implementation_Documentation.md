# Precision Farming Dashboard & IoT Platform - Full Implementation Documentation

**Architecture:** 6 Nodes per Stand • Next.js/Vercel • Render API • Firebase • ESP32/RS485

**Status:** Consolidated architecture specification - supersedes previous four-Node-per-Stand documents.

---

## Executive Summary

This document is the consolidated implementation specification for the precision-farming dashboard and its supporting IoT platform. It supersedes earlier project notes that described four Nodes per Stand.

**Locked physical model**

- One **Farm** contains any number of Stands, based on field size and coverage requirements.
- One **Stand** is one monitoring/control zone centered on one ESP32 controller.
- One Stand contains **six Nodes**.
- One **Node** is one plant/measurement point with one 7-in-1 RS485/Modbus soil probe.
- Four Stands therefore contain **24 Nodes and four Stand controllers**.
- A separate central-station controller may operate the water pump and N/P/K dosing system.

**Locked web/cloud stack for the current build**

- ESP32 firmware: C++ / Arduino framework.
- Web dashboard: Next.js + React + TypeScript.
- Web hosting: Vercel.
- Test/backend API: Node.js + TypeScript + Express (or Fastify) hosted on Render.
- Realtime cloud/database: Firebase Realtime Database.
- Human authentication: Firebase Authentication.
- Server-side privileged Firebase access: Firebase Admin SDK from Render.
- Client abuse protection: Firebase App Check where practical.

The implementation is intentionally hybrid: telemetry can flow directly from ESP32 to Firebase and from Firebase to the dashboard, while trusted actuator requests should pass through the Render API before becoming device commands.

---

## 1. System Goals

The system must provide a farmer or researcher with a single web interface that can monitor and control a distributed precision-farming installation. The minimum production objectives are:

- identify every Farm, Stand, Node, sensor and controller unambiguously;
- collect soil moisture, temperature, EC, pH, nitrogen, phosphorus and potassium from each 7-in-1 probe;
- maintain current telemetry and historical telemetry separately;
- show controller and sensor health in real time;
- operate when there are many Stands without redesigning the data model;
- create irrigation and fertigation requests from the web dashboard;
- validate command permissions and safety limits on the server;
- acknowledge commands at the device;
- record a complete operation history including failures;
- preserve telemetry during temporary Internet loss where practical;
- keep credentials and privileged keys out of public source code;
- support a later mobile application without changing the core backend contract.

---

## 2. Locked Terminology and Identity Model

Use these terms consistently in firmware, Firebase, the Render API, Vercel UI, diagrams, documentation and field labels.

| Term | Meaning | Example |
|---|---|---|
| `FARM_ID` | Logical identity of one farm/site | `FARM_001` |
| `STAND_ID` | One ESP32-centered zone containing six Nodes | `STAND_01` |
| `NODE_ID` | One plant/measurement position | `NODE_04` |
| Modbus address | Physical RS485 slave address of the 7-in-1 probe | `4` |
| Controller UID | Firebase/device identity for one Stand controller | device-specific UID |
| Controller MAC | Physical ESP32 MAC address used for maintenance | hardware MAC |
| Operation ID | End-to-end irrigation/fertigation transaction | `OP_20260926_0001` |
| Command ID | Device command instance | `CMD_20260926_0001` |

A logical ID must not be tied permanently to a particular ESP32 board. If the ESP32 for `STAND_02` is replaced, the Stand remains `STAND_02`; only the controller registry entry and MAC change.

---

## 3. Capacity and Replication Model

One Stand always contains six Nodes in the current design.

```text
node_count = stand_count × 6
```

Examples:

| Stands | ESP32 Stand controllers | Nodes / 7-in-1 sensors |
|---:|---:|---:|
| 1 | 1 | 6 |
| 2 | 2 | 12 |
| 4 | 4 | 24 |
| 10 | 10 | 60 |
| 20 | 20 | 120 |

The field size determines how many Stands are installed. The software must therefore discover/configure Stands dynamically rather than hard-coding exactly four Stands into the dashboard.

---

## 4. Physical Stand Design

Each Stand places one ESP32/control enclosure in a central practical location and distributes six sensor Nodes around the monitored planting area. The exact geometry can follow the field row/bed arrangement; the software only requires a stable logical Node order.

Recommended mapping for one Stand:

```text
STAND_01
├── NODE_01 -> 7-in-1 probe -> Modbus address 1
├── NODE_02 -> 7-in-1 probe -> Modbus address 2
├── NODE_03 -> 7-in-1 probe -> Modbus address 3
├── NODE_04 -> 7-in-1 probe -> Modbus address 4
├── NODE_05 -> 7-in-1 probe -> Modbus address 5
└── NODE_06 -> 7-in-1 probe -> Modbus address 6
```

Physically label sensor cables and probes with both `STAND_ID` and `NODE_ID`, for example `S01-N04`. This prevents field swaps from silently corrupting the database mapping.

---

## 5. Six Sensors on One ESP32: Technical Feasibility

Six RS485/Modbus probes can share one ESP32 UART through one suitable RS485 transceiver, provided the probes are configured correctly.

Required conditions:

- unique Modbus slave address for every probe on the bus;
- the same baud rate, parity and stop-bit settings across all six probes;
- correct A/B polarity;
- correct probe supply voltage;
- common reference/ground where required by the transceiver design;
- suitable cable and termination for the field distance;
- sequential polling: the ESP32 asks one address at a time;
- a 3.3-V-compatible RS485 interface for the ESP32; for long outdoor runs, isolated/protected RS485 hardware is preferable.

Avoid designing the electrical bus as six very long star branches. RS485 is most reliable as a trunk/bus with short stubs. The physical plant geometry and the electrical cable route do not need to look the same.

Before field installation, bench-test all six probes on one bus at the intended baud rate and cable length.

---

## 6. Stand Hardware Components

Minimum Stand-side components:

- 1 × ESP32 development board/module (exact model to be confirmed);
- 6 × CWT 7-in-1 RS485/Modbus soil probes;
- 1 × suitable 3.3-V-compatible RS485 transceiver or isolated RS485 interface;
- 12-V field power source as required by the sensors/actuators;
- solar charge controller if solar charging is used;
- battery sized from the measured energy budget;
- buck converter/regulator for the ESP32 supply;
- fuse/protection and suitable terminal blocks;
- weather-resistant enclosure;
- optional SD card module for local telemetry queue/logging;
- optional Node-specific solenoid valves and valve drivers when irrigation control is added;
- optional flow sensor(s) where delivered water volume must be verified.

Items that must be verified from exact datasheets before final wiring: probe supply range, ESP32 board input method, RS485 transceiver logic levels, battery chemistry, solar panel rating, valve voltage/current and flow-sensor electrical interface.

---

## 7. Power Architecture

A production power path should be explicit rather than improvised:

```text
Solar panel (if used)
        ↓
Solar charge controller
        ↓
Battery
        ├── sensor / actuator rail (only if voltage range is confirmed)
        └── buck/regulator → ESP32 supply
```

A battery-management system is not automatically a solar charge controller. Size the system from measured daily energy use, including ESP32 Wi-Fi activity, six probes, valve duty and communication overhead. Include cloudy-day autonomy if the system will be deployed continuously.

Do not power solenoid valves directly from ESP32 GPIO. Use correctly rated MOSFET/relay drivers and flyback protection for inductive loads.

---

## 8. Farm Network and Wi-Fi

Only the Stand controller joins Wi-Fi; the six sensors communicate locally over RS485. Four Stands therefore create four Stand Wi-Fi clients, not 24.

Recommended network:

```text
Stand ESP32s → 2.4 GHz farm Wi-Fi/AP → 4G/5G/fixed Internet router → Firebase/Render
```

Requirements:

- confirm 2.4-GHz Wi-Fi coverage at each enclosure location;
- use an outdoor access point/CPE where a normal indoor router is insufficient;
- avoid metal enclosures that completely shield the ESP32 antenna;
- do not expose inbound ports on the ESP32;
- all cloud sessions should be initiated outbound by the controller;
- provide reconnect/backoff logic;
- record RSSI in controller health telemetry.

For production provisioning, do not keep farm Wi-Fi passwords permanently hard-coded in the main firmware source. Store provisioned credentials in NVS/flash and keep secrets out of Git.

---

## 9. Whole-System Cloud Architecture

The selected architecture uses three cloud responsibilities rather than treating one product as everything:

**Firebase** is the realtime data and identity layer.

- Realtime Database stores current state, logs, status, commands and operations.
- Firebase Authentication signs in human users.
- Security Rules protect browser/device access.
- App Check can reduce abuse from unauthorized web clients.

**Render** is the current trusted backend/API layer.

- verifies Firebase ID tokens;
- checks user roles and farm access;
- validates command payloads and safety limits;
- checks whether a controller is sufficiently current/online;
- creates authoritative command/operation records;
- uses Firebase Admin SDK for privileged access;
- provides API health/status endpoints during development.

**Vercel** hosts the farmer-facing Next.js web application.

- serves the dashboard;
- uses the Firebase Web SDK for auth and realtime reads;
- calls the Render API for privileged actions.

For the current build, Render is intentionally retained for testing and development. A free Render service is suitable for testing, but its idle spin-down behavior means it should not be treated as an always-on final field command service unless the service plan/architecture is changed.

---

## 10. Languages and Frameworks

| Layer | Technology | Primary language |
|---|---|---|
| ESP32 Stand firmware | Arduino / ESP32 | C++ |
| Central fertigation firmware | Arduino / ESP32 | C++ |
| Web frontend | Next.js + React | TypeScript / TSX |
| Web styling | Tailwind CSS (recommended) | CSS |
| Render API | Node.js + Express or Fastify | TypeScript |
| Firebase Admin integration | `firebase-admin` | TypeScript |
| Firebase browser integration | Firebase JS SDK | TypeScript |
| Database payloads | Firebase RTDB | JSON |
| Security policy | Firebase RTDB Rules | JSON + rules expressions |
| Mobile application later | Flutter | Dart |
| Research/ML later | optional services/notebooks | Python |

---

## 11. Recommended Repository Structure

A monorepo keeps the data contract visible across firmware, backend and frontend:

```text
precision-farming/
├── apps/
│   └── web/                 # Next.js dashboard
├── services/
│   └── api/                 # Render Node/TypeScript backend
├── firmware/
│   ├── stand-controller/    # six-node ESP32 firmware
│   └── central-station/     # pump/dosing controller
├── firebase/
│   ├── database.rules.json
│   ├── database.indexes.json
│   └── seed/
├── packages/
│   └── contracts/           # shared JSON/TS schemas where appropriate
├── docs/
├── .github/workflows/
├── .env.example
└── README.md
```

Never commit production `.env`, service-account private keys, Wi-Fi passwords or device passwords.

---

## 12. Environment Strategy

Use separate environments. Do not test actuator logic against the final farm database.

| Environment | Web | API | Firebase | Hardware |
|---|---|---|---|---|
| Local development | `localhost:3000` | `localhost:4000` | Firebase Emulator or dev project | simulator/bench controller |
| Preview/Staging | Vercel Preview | Render staging service | staging Firebase project | bench/field test Stand |
| Production | Vercel production | always-on production backend (Render or later alternative) | production Firebase project | real field controllers |

Environment-specific IDs, URLs and safety limits should be independently configurable.

---

## 13. Vercel / Next.js Environment Variables

Browser-accessible Firebase configuration and the Render API base URL belong in the Vercel/Next.js configuration.

Example `.env.local` / Vercel settings:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-api.onrender.com
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_DEFAULT_FARM_ID=FARM_001
```

If Firebase web messaging is added:

```env
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

In Next.js, values prefixed with `NEXT_PUBLIC_` are bundled for browser access. Do not place server secrets behind that prefix. Vercel supports different environment values for development, preview and production deployments.

---

## 14. Render Backend Environment Variables

Render holds privileged backend configuration. Example:

```env
NODE_ENV=production
PORT=10000
FRONTEND_ORIGIN=https://your-dashboard.vercel.app
FIREBASE_PROJECT_ID=...
FIREBASE_DATABASE_URL=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
COMMAND_EXPIRY_SECONDS=120
CONTROLLER_OFFLINE_SECONDS=180
MAX_IRRIGATION_LITERS=20
MAX_NITROGEN_ML=100
MAX_PHOSPHORUS_ML=100
MAX_POTASSIUM_ML=100
```

`FIREBASE_PRIVATE_KEY` and equivalent service-account secrets must remain server-only. Store them using Render's environment/secret configuration rather than source control.

The backend should expose a `/health` endpoint for Render health checks and development diagnostics.

---

## 15. ESP32 Configuration and Provisioning

Each Stand controller requires:

```text
FARM_ID
STAND_ID
six NODE_ID ↔ Modbus-address mappings
Wi-Fi SSID and password
Firebase/device identity or token strategy
telemetry interval
firmware version
optional SD queue settings
actuator pin/channel mappings when control is enabled
```

Recommended logical configuration:

```cpp
const char* FARM_ID  = "FARM_001";
const char* STAND_ID = "STAND_01";

NodeConfig nodes[] = {
  {"NODE_01", 1},
  {"NODE_02", 2},
  {"NODE_03", 3},
  {"NODE_04", 4},
  {"NODE_05", 5},
  {"NODE_06", 6}
};
```

Production provisioning should store Wi-Fi and installation-specific values in NVS/flash so one firmware binary can be reused across Stands. Provide a controlled provisioning method such as temporary AP setup, BLE setup, or a technician serial utility.

---

## 16. Firebase Realtime Database Schema

Recommended top-level hierarchy:

```text
/farms
  /FARM_001
    /metadata
    /stands
      /STAND_01
        /metadata
        /controller
        /nodes
          /NODE_01
            /metadata
            /current
            /status
            /logs
          /NODE_02
          /NODE_03
          /NODE_04
          /NODE_05
          /NODE_06
        /commands
        /operations
    /central_station
      /status
      /commands
      /operations
    /alerts
/users
/deviceRegistry
/system
```

Do not keep the current prototype's generic `/fertigation/logs` as the final structure. The hierarchy must preserve Farm → Stand → Node identity at every stage.

---

## 17. Metadata Records

**Farm metadata** may include display name, location label, timezone and active status.

**Stand metadata** example:

```json
{
  "stand_id": "STAND_01",
  "name": "Stand 01",
  "node_count": 6,
  "active": true
}
```

**Node metadata** example:

```json
{
  "node_id": "NODE_04",
  "position": 4,
  "sensor_type": "CWT_7_IN_1",
  "modbus_address": 4,
  "enabled": true
}
```

**Controller registry** must separately associate the authenticated device with its allowed Farm/Stand. This is what prevents one compromised Stand controller from writing another Stand's data.

---

## 18. Telemetry Data Contract

Use one stable shape and avoid mixing numeric values with text error strings.

Example `/current` record:

```json
{
  "measured_at": 1790427600000,
  "sequence": 1252,
  "moisture": {"value": 31.2, "valid": true},
  "temperature": {"value": 27.4, "valid": true},
  "ec": {"value": 820, "valid": true},
  "ph": {"value": 6.3, "valid": true},
  "nitrogen": {"value": 30, "valid": true},
  "phosphorus": {"value": 18, "valid": true},
  "potassium": {"value": 41, "valid": true}
}
```

Failed field example:

```json
{
  "value": null,
  "valid": false,
  "error": "MODBUS_TIMEOUT"
}
```

The exact engineering units for N/P/K must be confirmed from the exact sensor manual/calibration before the production UI labels them.

---

## 19. Current vs Historical Telemetry

Every successful telemetry cycle should perform two separate actions:

1. overwrite the Node's `/current` record;
2. append a new record under `/logs/{pushId}`.

The dashboard uses `/current` for overview cards and subscribes to it in real time. Historical graphs query only the required range from `/logs`; the dashboard must not download the entire history merely to show the latest value.

Index fields used for range queries, typically `measured_at`, in Realtime Database Rules.

---

## 20. Controller and Node Health

Controller status should include at least:

```json
{
  "online": true,
  "last_seen": 1790427600000,
  "mac_address": "...",
  "firmware_version": "1.0.0",
  "wifi_rssi": -58,
  "firebase_connected": true,
  "sd_ready": true,
  "uptime_seconds": 123456
}
```

Each Node status should independently report RS485 health and last successful reading. A Stand can therefore be online while one sensor is offline.

Recommended Node states:

- `ONLINE`
- `STALE`
- `MODBUS_TIMEOUT`
- `CRC_ERROR`
- `DISABLED`
- `UNKNOWN`

---

## 21. Render API Responsibilities

The Render API is a trusted mediator for operations that should not be writable directly by arbitrary browser code.

Minimum responsibilities:

- verify Firebase ID tokens on protected endpoints;
- retrieve user role and farm assignment;
- validate request bodies with a schema library such as Zod;
- reject unknown Farms, Stands and Nodes;
- apply irrigation/fertilizer maximums;
- check command conflicts;
- create `operation_id` and `command_id` values;
- write authoritative command records with Firebase Admin SDK;
- expose operation status to the frontend;
- write audit metadata (`requested_by`, timestamps, source/client version);
- optionally verify Firebase App Check tokens for requests from the web app;
- emit structured logs.

---

## 22. Minimum Render API Endpoints

Suggested REST surface:

```text
GET  /health
GET  /api/farms
GET  /api/farms/:farmId/stands
GET  /api/farms/:farmId/stands/:standId
GET  /api/farms/:farmId/stands/:standId/nodes
GET  /api/operations/:operationId
GET  /api/alerts
POST /api/alerts/:alertId/acknowledge
POST /api/commands/irrigate
POST /api/commands/fertigate
POST /api/commands/:commandId/cancel   # only if cancellation is physically safe
```

For high-frequency live telemetry, the frontend should subscribe directly to Firebase rather than routing every value through Render.

---

## 23. Authentication and Authorization Flow

Human login:

```text
Browser -> Firebase Authentication -> Firebase ID token
Browser -> Render API with Bearer token
Render -> Firebase Admin verifyIdToken()
Render -> role/farm authorization -> allow/deny
```

Recommended roles:

| Role | Telemetry | Export | Irrigate | Fertigate | User/config management |
|---|---:|---:|---:|---:|---:|
| Admin | Yes | Yes | Yes | Yes | Yes |
| Farm Manager | Yes | Yes | Yes | Yes | Limited |
| Researcher | Yes | Yes | No by default | No by default | No |
| Field Worker | Yes | Limited | Optional | No by default | No |

Authorization must be enforced at the backend/Rules layer, not only by hiding buttons in the browser.

---

## 24. Device Authentication and Registry

Do not use one shared production username/password across every ESP32.

Create an identity/registry model in which each Stand controller is independently revocable:

```json
/deviceRegistry/{uid} = {
  "enabled": true,
  "role": "stand_controller",
  "farm_id": "FARM_001",
  "stand_id": "STAND_01"
}
```

The central-station controller receives its own identity. Replacing one ESP32 should not require changing the logical Stand ID or historical data.

---

## 25. Firebase Security Rules

Rules should be deny-by-default and then grant the minimum required paths.

Production goals:

- authenticated users can read only authorized Farm data;
- a Stand controller can write telemetry only under its registered Stand;
- device writes must pass data validation rules;
- browser clients cannot directly forge trusted controller execution state;
- privileged command creation is reserved for the trusted backend path;
- indexes are declared for production queries;
- rules are covered by Emulator Suite tests before deployment.

Realtime Database Rules support `.read`, `.write`, `.validate` and `.indexOn`; structure the data model around both query needs and authorization boundaries.

---

## 26. Firebase App Check

Use App Check for the web application where practical. It complements, but does not replace, Firebase Authentication and Security Rules.

For the custom Render backend, the web client can send an App Check token and the backend can verify it in addition to verifying the user's Firebase ID token. Keep App Check debug tokens private and use debug mode only in local/CI environments.

---

## 27. Command Data Contract

Example irrigation request after backend validation:

```json
{
  "command_id": "CMD_20260926_0001",
  "operation_id": "OP_20260926_0001",
  "type": "IRRIGATE",
  "farm_id": "FARM_001",
  "stand_id": "STAND_01",
  "target_nodes": ["NODE_04"],
  "water_liters": 5.0,
  "status": "PENDING",
  "created_at": 1790427600000,
  "expires_at": 1790427720000,
  "requested_by": "firebase-user-uid"
}
```

Never treat a simple value such as `valve=true` as the complete audit/command model for production.

---

## 28. Command State Machine

Minimum lifecycle:

```text
PENDING -> RECEIVED -> EXECUTING -> VERIFYING -> COMPLETED
                                  \-> FAILED
PENDING/RECEIVED -> CANCELLED (only when cancellation is safe and supported)
```

Definitions:

- `PENDING`: validated command exists in cloud, not yet acknowledged by device.
- `RECEIVED`: target controller has accepted the command ID.
- `EXECUTING`: physical action has begun.
- `VERIFYING`: controller is checking completion criteria such as delivered flow.
- `COMPLETED`: required criteria were met.
- `FAILED`: a defined error condition occurred.

A database write is not physical proof of irrigation. `COMPLETED` should only be emitted after the device reports the defined completion condition.

---

## 29. Command Idempotency and Expiry

The controller must not repeat physical actions merely because Firebase reconnects or a command is re-read.

Required controls:

- unique `command_id`;
- unique `operation_id`;
- record recently processed command IDs locally where practical;
- ignore already-completed command IDs;
- reject commands after `expires_at`;
- define what happens after controller reboot during an active operation;
- do not automatically retry a physical command unless the retry policy is explicitly safe.

---

## 30. Irrigation Hardware and Control

If the farmer must irrigate a particular Node independently, each Node needs a controllable hydraulic branch.

```text
Main water line
├── Valve 1 -> NODE_01
├── Valve 2 -> NODE_02
├── Valve 3 -> NODE_03
├── Valve 4 -> NODE_04
├── Valve 5 -> NODE_05
└── Valve 6 -> NODE_06
```

The Stand controller can command six valves if suitable driver channels are available. If GPIO is insufficient, use an appropriate I/O expander or driver board.

Safety requirements:

- no direct solenoid drive from GPIO;
- flyback suppression;
- defined safe state on reboot;
- do not run the main pump against all closed branches;
- define maximum operation duration;
- define no-flow timeout;
- prefer sequential watering during the first prototype if one flow meter is shared.

---

## 31. Verified Water Volume

If the dashboard displays "5.0 L delivered", the system should measure delivery rather than infer it from command acceptance.

Recommended control:

```text
open target valve
start main pump
count flow pulses / integrate flow
stop at target quantity
after-flow/settling check
stop pump
close valve
mark COMPLETED
```

If there is only one central flow meter, execute Nodes sequentially to attribute volume correctly. Parallel, independently verified irrigation requires branch-level flow measurement.

---

## 32. Central Fertigation Station

Keep fertilizer dosing in a separate central station unless the hydraulic design requires otherwise.

Minimum central station elements:

- separate ESP32/controller identity;
- main water pump control;
- N dosing pump;
- P dosing pump;
- K dosing pump;
- mixing/injection point;
- check valves/backflow prevention as appropriate;
- flow verification;
- flush capability;
- optional tank-level sensors only if they are actually installed.

One shared mixed line cannot deliver different fertilizer recipes to different Nodes at the same time. Execute different recipes sequentially with a defined flush procedure, or install separate hydraulic/dosing circuits.

---

## 33. Fertigation Operation Contract

Example:

```json
{
  "operation_id": "OP_20260926_0020",
  "type": "FERTIGATE",
  "farm_id": "FARM_001",
  "stand_id": "STAND_02",
  "target_nodes": ["NODE_02"],
  "water_liters": 8.0,
  "dosing_ml": {
    "nitrogen": 20,
    "phosphorus": 10,
    "potassium": 10
  },
  "status": "PENDING"
}
```

Dosing pumps must be calibrated under real tubing, viscosity and backpressure conditions. Time-based dosing alone should not be described as precise unless the calibration uncertainty is understood and periodically rechecked.

---

## 34. ESP32 Firmware Redesign

The current prototype firmware must be refactored before it represents this architecture. The important changes are:

1. replace one 7-in-1 address with six Node configurations;
2. poll Modbus addresses 1–6 sequentially;
3. add `FARM_ID`, `STAND_ID` and `NODE_ID` paths;
4. publish `/current`, `/logs` and `/status` per Node;
5. publish controller health separately;
6. implement command watching/processing;
7. remove the blocking one-minute main-loop delay;
8. use non-blocking scheduling (`millis()`/state machine or tasks);
9. implement command deduplication and expiry;
10. implement local queueing/retry for telemetry where practical;
11. provision credentials rather than committing them;
12. migrate away from the deprecated `Firebase_ESP_Client` library to the maintained `FirebaseClient` library after bench validation.

---

## 35. Recommended Firmware Loop

Architectural pseudocode:

```cpp
void loop() {
  maintainWiFi();
  maintainFirebase();
  processCommands();
  processActiveOperation();

  if (telemetryDue()) {
    for (NodeConfig &n : nodes) {
      Reading r = readSevenInOne(n.modbusAddress);
      updateCurrent(n, r);
      appendHistory(n, r);
      updateNodeStatus(n, r);
    }
    updateControllerStatus();
  }

  syncOfflineQueueIfPossible();
}
```

A telemetry interval may still be 60 seconds or several minutes, but the controller should not become unresponsive to commands for the entire telemetry interval.

---

## 36. Offline Operation and Data Recovery

Separate telemetry resilience from actuator safety.

**Telemetry**

- when Internet/Firebase is unavailable, continue reading sensors;
- queue readings to SD or another bounded local store with timestamps/sequence numbers;
- when connectivity returns, upload missing history in controlled batches;
- update `/current` with the newest measurement;
- prevent duplicate history records where possible.

**Commands**

- cloud commands cannot be guaranteed while the Stand is offline;
- the dashboard should clearly show controller offline/stale status;
- do not silently queue dangerous commands indefinitely;
- use command expiry;
- define local autonomous safety behavior separately from remote-control behavior.

---

## 37. Web Dashboard Information Architecture

Recommended main navigation:

```text
Overview
Farms / Stands
Alerts
Operations
Analytics
Central Station
Device Health
Settings
```

**Overview**

- total Stands;
- total Nodes;
- online/offline controllers;
- healthy/warning/offline Nodes;
- active alerts;
- active operation;
- recent completed/failed operations.

**Stand page**

- six Node positions in a spatial layout;
- central controller health;
- last update;
- Node status and key moisture value;
- direct navigation to Node details.

**Node page**

- current moisture, temperature, EC, pH, N, P, K;
- sensor health;
- historical charts;
- recent alerts;
- irrigation/fertigation action where role permits.

---

## 38. Dashboard UX Rules

Production UX must make stale/invalid information obvious.

- always show `Last updated`;
- distinguish `Loading`, `No data`, `Offline`, `Stale`, `Sensor error` and `Permission denied`;
- never show a failed sensor value as zero;
- do not rely on color alone for status;
- require confirmation before actuator requests;
- disable repeated submission while a command request is being created;
- show command timeline/state;
- display the exact target Farm/Stand/Node and requested quantities in the confirmation dialog;
- show delivered quantity only when it has been verified by the physical system.

---

## 39. Realtime Frontend Pattern

Use the Firebase Web SDK for live telemetry subscriptions. Suggested client layering:

```text
React component
  ↓
feature hook / state store
  ↓
repository
  ↓
Firebase RTDB service
```

Use the Render API for privileged mutations:

```text
React form -> API client -> Render -> Firebase Admin -> command/operation
```

Do not route every telemetry event through the Render API unless a later requirement justifies that cost and latency.

---

## 40. Frontend Project Structure

Suggested Next.js App Router structure:

```text
apps/web/
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── farms/[farmId]/
│   ├── stands/[standId]/
│   ├── nodes/[nodeId]/
│   ├── alerts/
│   ├── operations/
│   ├── analytics/
│   └── settings/
├── components/
├── features/
├── lib/
│   ├── firebase/
│   ├── api/
│   ├── auth/
│   └── validation/
├── types/
└── middleware.ts
```

Keep Firebase initialization centralized and avoid creating duplicate client instances.

---

## 41. Alerts and Notifications

Alert types fall into two groups.

**Agronomic/state alerts**

- low/high moisture;
- pH outside configured range;
- EC outside configured range;
- N/P/K outside configured range.

**System alerts**

- controller offline/stale;
- Node sensor timeout;
- repeated CRC/RS485 errors;
- SD unavailable;
- command expired;
- no water flow;
- valve/pump failure where feedback exists.

Agronomic thresholds must be crop/study-specific and configurable; do not hard-code universal values. Firebase Cloud Messaging can be added later for push notifications, while the in-app alert collection remains the durable record.

---

## 42. Historical Analytics and Research Data

The dashboard should support at least 1-hour, 24-hour, 7-day, 30-day and custom-range views. Compare:

- one Node over time;
- six Nodes within one Stand;
- equivalent Nodes across multiple Stands;
- irrigation/fertigation operations against subsequent soil response.

For the first implementation, Realtime Database can store this history. If the research workload grows into complex cross-farm aggregation, export/replicate data into an analytics-friendly store rather than forcing complex analytical queries into RTDB.

---

## 43. Security Controls Checklist

Required controls before field production:

- rotate all test credentials that have appeared in firmware or shared files;
- do not commit `.env` or private keys;
- use separate Firebase projects for non-production and production;
- enable Firebase Authentication for human users;
- implement role/farm authorization in Render;
- deploy tested Realtime Database Security Rules;
- create per-controller identities/registry records;
- restrict CORS on Render to the expected web origins;
- validate all API bodies and numeric ranges server-side;
- rate-limit sensitive endpoints where appropriate;
- verify command target/controller online status;
- add command expiry/idempotency;
- enable HTTPS only (Vercel/Render/Firebase provide TLS endpoints);
- use App Check for supported web/backend paths where appropriate;
- keep audit logs for command creation and completion.

---

## 44. Render Development/Testing Limitations

Render's free Web Service is appropriate for development, previews and testing. Current Render documentation states that a free web service spins down after 15 minutes without inbound traffic and may take about a minute to spin back up. Its local filesystem is ephemeral.

Implications:

- acceptable for development/testing;
- do not store persistent application data on Render local disk;
- keep persistence in Firebase;
- expect a cold-start delay after idle periods;
- before real field command control, use an always-on backend plan or move the command API to an always-on/serverless architecture that meets the required latency and availability.

---

## 45. Logging and Observability

Create structured logs in every layer.

**ESP32**

- boot reason;
- firmware version;
- Wi-Fi connect/disconnect;
- Firebase connect/auth status;
- Modbus response per Node;
- command IDs and state transitions;
- actuator errors.

**Render**

- request ID;
- authenticated user UID;
- Farm/Stand/Node targets;
- validation failures;
- created operation/command IDs;
- latency;
- exceptions.

**Web**

- authentication failures;
- API failures;
- unhandled client errors;
- optional error monitoring platform later.

Never log passwords, private keys or full service credentials.

---

## 46. Testing Strategy

Testing must cover software, electronics and hydraulics.

**Unit tests**

- API validation;
- authorization;
- command state transitions;
- utility/calculation functions;
- frontend model parsing.

**Firebase Emulator tests**

- authorized reads;
- unauthorized cross-Farm access;
- controller write restrictions;
- schema validation;
- indexes/query assumptions.

**Firmware bench tests**

- all six sensors on one bus;
- duplicate Modbus address failure;
- disconnected sensor;
- reversed A/B behavior;
- Wi-Fi loss/recovery;
- Firebase loss/recovery;
- SD unavailable;
- controller reboot;
- stale/expired command;
- duplicate command.

**Hydraulic tests**

- each valve targets the intended Node;
- all-closed pump interlock;
- no-flow detection;
- target volume accuracy;
- dosing pump calibration;
- flush sequence;
- loss of controller during operation.

**End-to-end tests**

Browser -> Render -> Firebase -> ESP32 -> actuator -> verification -> Firebase -> browser.

---

## 47. CI/CD and Deployment

Recommended Git workflow:

- feature branch -> pull request -> automated tests -> preview deployment;
- merge to main only after review;
- Vercel automatically deploys the production web branch;
- Render auto-deploys the API branch/service after tests;
- Firebase Rules deployment should be automated or tightly controlled through CI;
- firmware releases should be versioned separately and associated with a changelog.

Never allow a frontend preview deployment to point accidentally to the production command backend unless that is an explicit controlled test.

---

## 48. Deployment Procedure: Web on Vercel

1. Create/link the Vercel project to `apps/web`.
2. Set framework preset to Next.js.
3. Configure Development, Preview and Production environment variables.
4. Set `NEXT_PUBLIC_API_BASE_URL` to the appropriate Render environment.
5. Add Firebase web configuration variables.
6. Deploy a preview branch and verify login/read-only telemetry.
7. Verify CORS and authentication to the Render API.
8. Deploy production after staging acceptance.
9. Add a custom domain when required.

---

## 49. Deployment Procedure: API on Render

1. Create a Render Web Service connected to `services/api`.
2. Use Node runtime/build command appropriate to the project.
3. Configure start command to listen on Render's provided `PORT`.
4. Add Firebase Admin/service environment variables as secrets.
5. Add allowed frontend origin(s).
6. Add `/health` as a health-check path.
7. Deploy staging first.
8. Verify Firebase Admin access and token verification.
9. Verify command validation without actuators.
10. Only then allow commands to reach a bench controller.
11. For final field control, remove free-tier cold-start risk by using an appropriate always-on deployment or revised backend architecture.

---

## 50. Deployment Procedure: Firebase

1. Create separate dev/staging/production projects.
2. Enable Realtime Database in the selected region.
3. Configure Authentication providers.
4. Register the web application and obtain web configuration.
5. Create the initial data tree/metadata.
6. implement and test Security Rules locally.
7. create device-registry entries.
8. configure App Check for the production web application when ready.
9. enable required indexes.
10. define backup/export procedures for important data.

---

## 51. Firmware Release and Field Commissioning

For each Stand:

1. label controller enclosure with `FARM_ID` + `STAND_ID`;
2. label six probes/cables with Node IDs;
3. configure Modbus addresses 1–6 and record them;
4. bench test each probe individually;
5. bench test all six on the shared bus;
6. provision Wi-Fi and device identity;
7. flash the correct signed/versioned firmware build;
8. verify controller registry mapping;
9. install enclosure/power system;
10. verify Wi-Fi RSSI on site;
11. verify each Node appears under the correct Stand in the dashboard;
12. capture baseline sensor/reference readings;
13. test offline logging and reconnection;
14. test actuator channels safely if installed;
15. mark the Stand commissioned only after acceptance criteria pass.

---

## 52. Production Acceptance Criteria

A Stand is production-ready when:

- all six probes have stable unique Modbus addresses;
- each Node reads under the correct Firebase path;
- failed probes are shown as errors, not zero values;
- controller reconnects after Wi-Fi loss;
- offline/stale status is visible;
- dashboard updates without manual refresh;
- access control prevents unauthorized Farm/Stand access;
- Render rejects invalid/out-of-range commands;
- ESP32 does not execute duplicate command IDs twice;
- expired commands are rejected;
- requested Node maps to the correct physical valve;
- volume/dose claims match the verification method;
- operation status cannot become `COMPLETED` without device confirmation;
- audit/history remains available after browser reload/reconnect.

---

## 53. Scale-Up Plan

The architecture should scale by adding Stand records and device identities, not by creating a new application for each section of the farm.

When additional Stands are needed:

- allocate the next `STAND_ID`;
- install one controller and six Nodes;
- provision the controller;
- create/approve its registry entry;
- configure Node metadata;
- validate Wi-Fi coverage;
- run commissioning tests.

The dashboard should query available Stands from Firebase rather than assuming `STAND_01` to `STAND_04` are the only possible values.

---

## 54. Future Mobile App

The mobile app can be added later without replacing the backend contract.

Recommended mobile stack:

- Flutter / Dart;
- Firebase Authentication;
- Firebase Realtime Database subscriptions;
- Render API for privileged command requests;
- Firebase Cloud Messaging for push notifications.

The web version should be completed first, as requested, while keeping APIs/data contracts platform-neutral.

---

## 55. Data Retention and Backup

Define retention before data volume becomes large.

Recommended policy decisions:

- how long raw one-minute/five-minute telemetry is kept;
- whether older data is downsampled;
- whether research exports must be immutable;
- how operation/audit records are retained;
- backup/export frequency;
- restore test procedure.

Do not rely on Render filesystem persistence. Persistent application state belongs in Firebase or another intentional datastore.

---

## 56. Open Technical Decisions to Close Before Final Wiring

The following should remain explicitly marked **TBC / verify**, not guessed:

- exact model/manual and register map of each 7-in-1 probe;
- exact address-changing procedure for the probes;
- final baud/parity/stop-bit settings;
- exact ESP32 board/module;
- final 3.3-V-compatible/isolated RS485 transceiver;
- maximum sensor cable length and final termination scheme;
- battery chemistry/capacity;
- solar panel and charge-controller sizing;
- valve type, voltage/current and normally-open/normally-closed behavior;
- pump type/pressure/flow;
- flow-sensor model and calibration;
- dosing pump calibration and chemical compatibility;
- pipe/branch layout;
- whether irrigation is Node-specific or Stand-wide in the first hydraulic prototype;
- exact crop thresholds and agronomic decision rules.

---

## 57. Implementation Roadmap

**Phase A - contract and bench foundation**

- lock Farm/Stand/Node IDs;
- verify six 7-in-1 probes on one ESP32/RS485 bus;
- confirm registers/baud/address configuration;
- create development Firebase project and schema.

**Phase B - six-Node firmware**

- refactor firmware for addresses 1–6;
- implement current/log/status paths;
- implement non-blocking telemetry and health;
- implement local resilience;
- migrate Firebase library after bench validation.

**Phase C - read-only web**

- build Next.js/Vercel dashboard;
- Firebase login;
- overview/Stand/Node pages;
- realtime telemetry;
- historical charts;
- device health and alerts.

**Phase D - Render command backend**

- authentication middleware;
- role/farm authorization;
- validation and command creation;
- operation status endpoints;
- audit logs.

**Phase E - irrigation prototype**

- valve driver board;
- pump integration;
- flow measurement;
- command state machine;
- safe end-to-end tests.

**Phase F - fertigation**

- central controller;
- N/P/K pumps;
- calibrated dosing;
- sequential recipes/flush;
- complete operation records.

**Phase G - field rollout**

- deploy one Stand;
- stabilize;
- replicate to additional Stands;
- move command backend to always-on production capability;
- add mobile app later.

---

## 58. End-to-End Example

Example: farmer requests 5 L irrigation for `FARM_001 / STAND_03 / NODE_05`.

1. User signs in to the Vercel dashboard with Firebase Auth.
2. Browser obtains Firebase ID token.
3. User opens `STAND_03`, selects `NODE_05`, enters 5 L and confirms.
4. Browser calls `POST /api/commands/irrigate` on Render with the ID token.
5. Render verifies token, user role, Farm access, target IDs, quantity and controller status.
6. Render creates an Operation and Command in Firebase.
7. `STAND_03` ESP32 receives/reads the command and records `RECEIVED`.
8. Controller opens the Node 5 valve and records `EXECUTING`.
9. Central pump is coordinated according to the hydraulic design.
10. Flow measurement accumulates delivered volume.
11. At target volume the system stops flow and closes the branch.
12. Device reports verification result and `COMPLETED`, or reports `FAILED` with an error code.
13. Firebase updates in real time.
14. Vercel dashboard displays the final state and operation history.

---

## 59. Prototype-to-Production Changes from the Current Firmware

The currently supplied firmware is useful as a bench prototype but differs from the target architecture in important ways:

- it has one configured 7-in-1 sensor rather than six;
- it also reserves RS485 addresses for standalone NPK and pH sensors, which conflicts with the proposed six 7-in-1 address range if all share one bus;
- it publishes to the generic `/fertigation/logs` path rather than Farm/Stand/Node paths;
- it uses a blocking 60-second delay in the main loop;
- it keeps Wi-Fi/device credentials in source;
- it uses the deprecated `Firebase_ESP_Client` library;
- it does not implement command processing/idempotency/expiry;
- its SD logging is not yet a cloud resynchronization queue.

Therefore the current code should be treated as a reference for sensor-reading and connection behavior, not as the final production firmware.

---

## 60. Source / Platform References

Current platform behaviors used in this document were verified against official documentation as of September 2026:

1. Firebase Realtime Database overview - direct web/mobile client access, realtime synchronization and Security Rules: https://firebase.google.com/docs/database
2. Firebase Realtime Database Security Rules: https://firebase.google.com/docs/database/security
3. Firebase Authentication for Web: https://firebase.google.com/docs/auth/web/start
4. Firebase Admin SDK server setup: https://firebase.google.com/docs/admin/setup
5. Firebase App Check: https://firebase.google.com/docs/app-check
6. Firebase App Check for custom backend resources: https://firebase.google.com/docs/app-check/web/custom-resource
7. Render free service limitations: https://render.com/docs/free
8. Render Web Services: https://render.com/docs/web-services
9. Vercel environment variables: https://vercel.com/docs/environment-variables
10. Next.js environment variables: https://nextjs.org/docs/pages/guides/environment-variables
11. Deprecated Firebase ESP Client and migration recommendation: https://github.com/mobizt/Firebase-ESP-Client
12. Maintained FirebaseClient library: https://github.com/mobizt/FirebaseClient

---
