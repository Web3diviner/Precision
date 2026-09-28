# Precision Farming Platform

Precision Farming is a six-node, farm-scoped monitoring and command platform. The active product is a TypeScript workspace; the flat HTML dashboard and former `backend/` prototype are historical reference only and must not be deployed.

## Architecture

- `apps/web` — Next.js dashboard, deployed to Vercel.
- `services/api` — Express command API using Firebase Admin, deployed to Render.
- `packages/contracts` — shared IDs, telemetry, and command request schemas.
- `firebase` — Realtime Database rules, indexes, and development seed data.
- `firmware` — ESP32 controller firmware, currently fail-closed for actuator actions.

```text
ESP32 controller → Firebase Realtime Database → Next.js live dashboard
Browser → Firebase Authentication + App Check → Express API → Firebase command queue → controller acknowledgement
```

## Local development

Install dependencies once from the repository root:

```bash
npm install
```

Create `apps/web/.env.local` with the `NEXT_PUBLIC_*` entries from `.env.example`. Set the non-public Firebase Admin variables from `.env.example` in the shell or your process manager before starting the API; do not place service-account credentials in a browser-visible file.

Run the applications in separate terminals:

```bash
npm run dev:web
npm run dev:api
```

The dashboard runs on port 3000 and the API defaults to port 4000. The API requires `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` before it starts.

Build and type-check the workspace:

```bash
npm run typecheck
npm run build
```

## Firebase setup

1. Create a Firebase project and enable Email/Password Authentication.
2. Create the browser app, then configure the `NEXT_PUBLIC_FIREBASE_*` values in `apps/web/.env.local` and Vercel.
3. Seed a development-only database from `firebase/seed/development-farm.json`; it defines `FARM_001`, `STAND_01`, and six Nodes.
4. Create `/users/{uid}` with a supported role and Farm grant, for example:

```json
{"role":"admin","farm_ids":{"FARM_001":true}}
```

5. Register each controller independently at `/deviceRegistry/{controllerUid}` with `enabled`, `farm_id`, and `stand_id`.
6. Deploy rules and indexes only after emulator validation:

```bash
firebase deploy --only database
```

Browser users can read authorized telemetry, alerts, and operation history. Command queue records are readable only by the registered controller. Command creation always goes through the Express API.

## Deployment

`render.yaml` defines the API service. Set its Firebase Admin credentials, `FRONTEND_ORIGIN`, and command settings in Render. `apps/web/vercel.json` builds the Next.js app; configure browser Firebase variables and `NEXT_PUBLIC_API_BASE_URL` in Vercel.

For production browser command actions, configure Firebase App Check with a reCAPTCHA v3 site key, set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` in Vercel, and enable `REQUIRE_APP_CHECK=true` in Render.

Set `MAX_IRRIGATION_LITERS` in Render as the authoritative safety limit. Set the matching `NEXT_PUBLIC_MAX_IRRIGATION_LITERS` only to show the same limit in the browser.

## Safety status

The controller intentionally reports actuator commands as failed with `ACTUATOR_NOT_CONFIGURED` until valve/pump drivers, emergency stop, flow sensing, calibration, and hydraulic interlocks have been commissioned. Do not remove that fail-closed behavior before hardware validation.

See [architecture status](docs/architecture-status.md) for implemented and intentionally deferred work.
