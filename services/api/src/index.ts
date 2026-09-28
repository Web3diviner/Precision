import cors from "cors";
import express, { type RequestHandler } from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { fertigationRequestSchema, irrigationRequestSchema } from "@precision/contracts";

const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const positiveNumberEnv = (name: string, fallback: number) => { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback; };
if (!getApps().length) initializeApp({ credential: cert({ projectId: env("FIREBASE_PROJECT_ID"), clientEmail: env("FIREBASE_CLIENT_EMAIL"), privateKey: env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n") }), databaseURL: env("FIREBASE_DATABASE_URL") });

const db = getDatabase();
const auth = getAuth();
const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "").split(",").map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, methods: ["GET", "POST"], allowedHeaders: ["Authorization", "Content-Type", "X-Firebase-AppCheck"], maxAge: 86_400 }));
app.use(express.json({ limit: "32kb" }));
app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

const requireUser: RequestHandler = async (req, res, next) => {
  try { const token = req.header("authorization")?.replace(/^Bearer\s+/i, ""); if (!token) return res.status(401).json({ error: "AUTH_REQUIRED" }); res.locals.user = await auth.verifyIdToken(token); next(); }
  catch { res.status(401).json({ error: "INVALID_TOKEN" }); }
};

const requireAppCheck: RequestHandler = async (req, res, next) => {
  if (process.env.REQUIRE_APP_CHECK !== "true") return next();
  const token = req.header("x-firebase-appcheck");
  if (!token) return res.status(401).json({ error: "APP_CHECK_REQUIRED" });
  try { await getAppCheck().verifyToken(token); next(); }
  catch { res.status(401).json({ error: "INVALID_APP_CHECK" }); }
};

const attempts = new Map<string, { count: number; resetAt: number }>();
const commandRateLimit: RequestHandler = (_req, res, next) => {
  const uid = res.locals.user.uid as string; const now = Date.now(); const previous = attempts.get(uid);
  const entry = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : previous;
  entry.count += 1; attempts.set(uid, entry);
  if (entry.count > 5) return res.status(429).json({ error: "RATE_LIMITED", retry_after_seconds: Math.ceil((entry.resetAt - now) / 1000) });
  next();
};

type UserProfile = { role?: string; farm_ids?: Record<string, boolean> };
async function profile(uid: string) { return (await db.ref(`users/${uid}`).get()).val() as UserProfile | null; }
async function canRead(uid: string, farmId: string) { return Boolean((await profile(uid))?.farm_ids?.[farmId]); }
async function canOperate(uid: string, farmId: string) { const user = await profile(uid); return Boolean(user?.farm_ids?.[farmId]) && ["admin", "farm_manager"].includes(user?.role ?? ""); }

const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
type CommandKind = "IRRIGATE" | "FERTIGATE";
type OperationState = { status?: string };

const activeOperationStatuses = new Set(["PENDING", "RECEIVED", "EXECUTING", "VERIFYING"]);

async function acquireCommandLock(farmId: string, standId: string, lockId: string) {
  const lockRef = db.ref(`system/locks/command_creation/${farmId}/${standId}`);
  const expiresAt = Date.now() + 30_000;
  const result = await lockRef.transaction(current => {
    if (current?.expires_at && current.expires_at > Date.now()) return;
    return { lock_id: lockId, expires_at: expiresAt };
  });
  return result.committed;
}

async function releaseCommandLock(farmId: string, standId: string, lockId: string) {
  await db.ref(`system/locks/command_creation/${farmId}/${standId}`).transaction(current =>
    current?.lock_id === lockId ? null : undefined,
  );
}

async function createCommand(req: express.Request, res: express.Response, kind: CommandKind) {
  const parsed = (kind === "IRRIGATE" ? irrigationRequestSchema : fertigationRequestSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
  const input = parsed.data;
  const maxIrrigationLiters = positiveNumberEnv("MAX_IRRIGATION_LITERS", 20);
  if (input.waterLiters > maxIrrigationLiters) return res.status(400).json({ error: "MAX_IRRIGATION_EXCEEDED", max_liters: maxIrrigationLiters });
  const uid = res.locals.user.uid as string;
  if (!await canOperate(uid, input.farmId)) return res.status(403).json({ error: "FORBIDDEN" });
  const standPath = `farms/${input.farmId}/stands/${input.standId}`;
  const lockId = id("LOCK");
  if (!await acquireCommandLock(input.farmId, input.standId, lockId)) return res.status(409).json({ error: "OPERATION_BUSY" });

  try {
    const stand = (await db.ref(standPath).get()).val();
    if (!stand) return res.status(404).json({ error: "STAND_NOT_FOUND" });
    const staleAfterMs = positiveNumberEnv("CONTROLLER_OFFLINE_SECONDS", 180) * 1000;
    if (!stand?.controller?.online || Date.now() - (stand.controller.last_seen ?? 0) > staleAfterMs) return res.status(409).json({ error: "CONTROLLER_OFFLINE" });
    if (!input.targetNodes.every(node => stand.nodes?.[node]?.metadata && stand.nodes[node].metadata.enabled !== false)) return res.status(400).json({ error: "INVALID_NODE" });

    const operations = (stand.operations ?? {}) as Record<string, OperationState>;
    if (Object.values(operations).some(operation => activeOperationStatuses.has(operation.status ?? ""))) {
      return res.status(409).json({ error: "OPERATION_BUSY" });
    }

    const createdAt = Date.now(); const operationId = id("OP"); const commandId = id("CMD"); const source = "web_api";
    const command = { command_id: commandId, operation_id: operationId, type: kind, farm_id: input.farmId, stand_id: input.standId, target_nodes: input.targetNodes, water_liters: input.waterLiters, ...(kind === "FERTIGATE" ? { dosing_ml: (input as typeof input & { dosingMl: { nitrogen: number; phosphorus: number; potassium: number } }).dosingMl } : {}), status: "PENDING", requested_by: uid, source, created_at: createdAt, expires_at: createdAt + positiveNumberEnv("COMMAND_EXPIRY_SECONDS", 120) * 1000 };
    await db.ref().update({ [`${standPath}/operations/${operationId}`]: command, [`${standPath}/commands/${commandId}`]: command, [`system/audit/${operationId}`]: { action: "COMMAND_CREATED", actor: uid, source, at: createdAt, farm_id: input.farmId, stand_id: input.standId } });
    return res.status(201).json({ operationId, commandId, status: "PENDING" });
  } finally {
    await releaseCommandLock(input.farmId, input.standId, lockId).catch(error => console.error(JSON.stringify({ event: "command_lock_release_failed", lock_id: lockId, error: error instanceof Error ? error.message : "UNKNOWN" })));
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "precision-api" }));
app.get("/api/farms", requireUser, async (_req, res) => { const user = await profile(res.locals.user.uid); const farmIds = Object.entries(user?.farm_ids ?? {}).filter(([, allowed]) => allowed).map(([farmId]) => farmId); const records = await Promise.all(farmIds.map(async id => ({ id, metadata: (await db.ref(`farms/${id}/metadata`).get()).val() }))); res.json(records); });
app.get("/api/farms/:farmId/stands", requireUser, async (req, res) => { const farmId = String(req.params.farmId); if (!await canRead(res.locals.user.uid, farmId)) return res.status(403).json({ error: "FORBIDDEN" }); const stands = (await db.ref(`farms/${farmId}/stands`).get()).val() ?? {}; res.json(stands); });
app.get("/api/farms/:farmId/stands/:standId", requireUser, async (req, res) => { const farmId = String(req.params.farmId); if (!await canRead(res.locals.user.uid, farmId)) return res.status(403).json({ error: "FORBIDDEN" }); const stand = (await db.ref(`farms/${farmId}/stands/${String(req.params.standId)}`).get()).val(); return stand ? res.json(stand) : res.status(404).json({ error: "NOT_FOUND" }); });
app.get("/api/farms/:farmId/stands/:standId/nodes", requireUser, async (req, res) => { const farmId = String(req.params.farmId); if (!await canRead(res.locals.user.uid, farmId)) return res.status(403).json({ error: "FORBIDDEN" }); res.json((await db.ref(`farms/${farmId}/stands/${String(req.params.standId)}/nodes`).get()).val() ?? {}); });
app.get("/api/farms/:farmId/alerts", requireUser, async (req, res) => { const farmId = String(req.params.farmId); if (!await canRead(res.locals.user.uid, farmId)) return res.status(403).json({ error: "FORBIDDEN" }); res.json((await db.ref(`farms/${farmId}/alerts`).get()).val() ?? {}); });
app.post("/api/farms/:farmId/alerts/:alertId/acknowledge", requireUser, requireAppCheck, async (req, res) => {
  const farmId = String(req.params.farmId); const alertId = String(req.params.alertId); const uid = res.locals.user.uid as string;
  if (!await canOperate(uid, farmId)) return res.status(403).json({ error: "FORBIDDEN" });
  const alertRef = db.ref(`farms/${farmId}/alerts/${alertId}`);
  if (!(await alertRef.get()).exists()) return res.status(404).json({ error: "NOT_FOUND" });
  const acknowledgedAt = Date.now();
  await alertRef.update({ acknowledged: true, acknowledged_by: uid, acknowledged_at: acknowledgedAt, updated_at: acknowledgedAt });
  await db.ref(`system/audit/${id("ALERT_ACK")}`).set({ action: "ALERT_ACKNOWLEDGED", actor: uid, at: acknowledgedAt, farm_id: farmId, alert_id: alertId });
  res.json({ alertId, acknowledged: true, acknowledgedAt });
});
app.get("/api/farms/:farmId/stands/:standId/operations/:operationId", requireUser, async (req, res) => { const farmId = String(req.params.farmId); if (!await canRead(res.locals.user.uid, farmId)) return res.status(403).json({ error: "FORBIDDEN" }); const operation = (await db.ref(`farms/${farmId}/stands/${String(req.params.standId)}/operations/${String(req.params.operationId)}`).get()).val(); return operation ? res.json(operation) : res.status(404).json({ error: "NOT_FOUND" }); });
app.post("/api/commands/irrigate", requireUser, requireAppCheck, commandRateLimit, async (req, res) => createCommand(req, res, "IRRIGATE"));
app.post("/api/commands/fertigate", requireUser, requireAppCheck, commandRateLimit, async (req, res) => createCommand(req, res, "FERTIGATE"));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({ event: "api_request_failed", error: error instanceof Error ? error.message : "UNKNOWN" }));
  if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
});
app.listen(Number(process.env.PORT ?? 4000), () => console.info(JSON.stringify({ event: "api_started" })));
