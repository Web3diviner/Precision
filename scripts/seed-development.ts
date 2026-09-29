import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const farmIds = Array.from({ length: 10 }, (_, index) => `FARM_${String(index + 1).padStart(3, "0")}`);
const standIds = Array.from({ length: 10 }, (_, index) => `STAND_${String(index + 1).padStart(2, "0")}`);
const nodeIds = Array.from({ length: 6 }, (_, index) => `NODE_${String(index + 1).padStart(2, "0")}`);
const dryRun = process.argv.includes("--dry-run");

const standRecord = (farmNumber: number, standNumber: number) => ({
  metadata: { stand_id: standIds[standNumber - 1], name: `Farm ${farmNumber} · Block ${standNumber}`, node_count: 6, active: true },
  controller: { online: false, last_seen: 0, firmware_version: "TBC", firebase_connected: false, sd_ready: false },
  nodes: Object.fromEntries(nodeIds.map((nodeId, index) => [nodeId, { metadata: { node_id: nodeId, position: index + 1, sensor_type: "CWT_7_IN_1", modbus_address: index + 1, enabled: true } }])),
});

async function main() {
  if (dryRun) {
    console.info(JSON.stringify({ event: "development_seed_plan", farms: farmIds.length, stands_per_farm: standIds.length, nodes_per_stand: nodeIds.length, controller_units: farmIds.length * standIds.length }));
    return;
  }
  if (!getApps().length) initializeApp({ credential: cert({ projectId: env("FIREBASE_PROJECT_ID"), clientEmail: env("FIREBASE_CLIENT_EMAIL"), privateKey: env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n") }), databaseURL: env("FIREBASE_DATABASE_URL") });
  const db = getDatabase();
  const farms = (await db.ref("farms").get()).val() as Record<string, { stands?: Record<string, unknown> }> | null ?? {};
  const updates: Record<string, unknown> = {};
  let createdFarms = 0;
  let createdStands = 0;
  for (const [farmIndex, farmId] of farmIds.entries()) {
    const farm = farms[farmId];
    if (!farm) {
      updates[`farms/${farmId}/metadata`] = { name: `Development farm ${farmIndex + 1}`, timezone: "Africa/Lagos", active: true };
      createdFarms += 1;
    }
    for (const [standIndex, standId] of standIds.entries()) {
      if (farm?.stands?.[standId]) continue;
      updates[`farms/${farmId}/stands/${standId}`] = standRecord(farmIndex + 1, standIndex + 1);
      createdStands += 1;
    }
  }
  if (createdFarms || createdStands) await db.ref().update(updates);
  console.info(JSON.stringify({ event: "development_seed_complete", created_farms: createdFarms, created_stands: createdStands, skipped_existing_stands: farmIds.length * standIds.length - createdStands }));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Seed failed"); process.exitCode = 1; });
