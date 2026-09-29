import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("Firebase deploy manifest selects the active farm-scoped rules and indexes", () => {
  const config = json("firebase.json") as { database?: { rules?: string; indexes?: string }; emulators?: { ui?: { port?: number } } };
  assert.equal(config.database?.rules, "firebase/database.rules.json");
  assert.equal(config.database?.indexes, "firebase/database.indexes.json");
  assert.equal(config.emulators?.ui?.port, 4001, "Firebase Emulator UI must not collide with the local API on port 4000");
});

test("retired root rules files fail closed", () => {
  for (const file of ["database.rules.json", "firebase-rules.template.json"]) {
    const rules = json(file) as { rules?: { ".read"?: boolean; ".write"?: boolean } };
    assert.equal(rules.rules?.[".read"], false, `${file} must not grant reads`);
    assert.equal(rules.rules?.[".write"], false, `${file} must not grant writes`);
  }
});

test("local web API fallbacks match the API service port", () => {
  const api = readFileSync("services/api/src/index.ts", "utf8");
  const dashboard = readFileSync("apps/web/components/dashboard.tsx", "utf8");
  const operationForm = readFileSync("apps/web/components/operation-form.tsx", "utf8");
  assert.match(api, /process\.env\.PORT \?\? 4000/);
  assert.match(dashboard, /http:\/\/localhost:4000/);
  assert.match(operationForm, /http:\/\/localhost:4000/);
});

test("the lockfile does not require a Windows-only Next compiler on Linux deploys", () => {
  const lock = json("package-lock.json") as { packages: Record<string, { devDependencies?: Record<string, string>; optional?: boolean; os?: string[] }> };
  assert.equal(lock.packages[""]?.devDependencies?.["@next/swc-win32-x64-msvc"], undefined);
  const compiler = lock.packages["node_modules/@next/swc-win32-x64-msvc"];
  assert.equal(compiler?.optional, true);
  assert.deepEqual(compiler?.os, ["win32"]);
});

test("development seed contains multiple Farms with independent offline six-node Stands", () => {
  const seed = json("firebase/seed/development-farm.json") as { farms: Record<string, { stands: Record<string, { controller: { online?: boolean }; nodes: Record<string, { metadata?: { enabled?: boolean; modbus_address?: number } }> }> }> };
  assert.deepEqual(Object.keys(seed.farms).sort(), ["FARM_001", "FARM_002"]);
  for (const farm of Object.values(seed.farms)) {
    assert.deepEqual(Object.keys(farm.stands).sort(), ["STAND_01", "STAND_02"]);
    for (const stand of Object.values(farm.stands)) {
      assert.equal(stand.controller.online, false);
      const nodeIds = Object.keys(stand.nodes).sort();
      assert.deepEqual(nodeIds, ["NODE_01", "NODE_02", "NODE_03", "NODE_04", "NODE_05", "NODE_06"]);
      const addresses = nodeIds.map((nodeId) => stand.nodes[nodeId].metadata?.modbus_address).sort((a, b) => (a ?? 0) - (b ?? 0));
      assert.deepEqual(addresses, [1, 2, 3, 4, 5, 6]);
      assert.ok(nodeIds.every((nodeId) => stand.nodes[nodeId].metadata?.enabled === true));
    }
  }
});

test("active controller write paths require an enabled device registry entry", () => {
  const rules = json("firebase/database.rules.json") as { rules: Record<string, Record<string, unknown>> };
  const farm = rules.rules.farms as Record<string, Record<string, unknown>>;
  const stand = (farm.$farmId.stands as Record<string, Record<string, unknown>>).$standId;
  const node = (stand.nodes as Record<string, Record<string, unknown>>).$nodeId;
  const paths = [stand.controller, node.current, (node.logs as Record<string, Record<string, unknown>>).$logId, node.status];
  for (const path of paths) assert.match(String((path as Record<string, unknown>)[".write"]), /child\('enabled'\)\.val\(\) === true/);
});

test("authorized users can subscribe to the Node collection without command-queue access", () => {
  const rules = json("firebase/database.rules.json") as { rules: Record<string, Record<string, unknown>> };
  const farm = rules.rules.farms as Record<string, Record<string, unknown>>;
  const stand = (farm.$farmId.stands as Record<string, Record<string, unknown>>).$standId;
  const nodes = stand.nodes as Record<string, unknown>;
  const commands = stand.commands as Record<string, unknown>;
  assert.match(String(nodes[".read"]), /farm_ids/);
  assert.match(String(commands[".read"]), /child\('enabled'\)\.val\(\) === true/);
  assert.equal((commands.$commandId as Record<string, unknown>)[".write"], false);
});

test("an enabled controller can append immutable command lifecycle timestamps", () => {
  const rules = json("firebase/database.rules.json") as { rules: Record<string, Record<string, unknown>> };
  const farm = rules.rules.farms as Record<string, Record<string, unknown>>;
  const stand = (farm.$farmId.stands as Record<string, Record<string, unknown>>).$standId;
  const command = (stand.commands as Record<string, Record<string, unknown>>).$commandId;
  for (const timestamp of ["received_at", "started_at", "completed_at"]) {
    const write = String((command[timestamp] as Record<string, unknown>)[".write"]);
    assert.match(write, /child\('enabled'\)\.val\(\) === true/);
    assert.match(write, /!data\.exists\(\)/);
    assert.match(write, /newData\.isNumber\(\)/);
  }
});

test("controller command-transition audit events are append-only and registry-bound", () => {
  const rules = json("firebase/database.rules.json") as { rules: Record<string, Record<string, unknown>> };
  const audit = ((rules.rules.system as Record<string, Record<string, unknown>>).audit as Record<string, Record<string, unknown>>).$eventId;
  const write = String(audit[".write"]);
  assert.match(write, /!data\.exists\(\)/);
  assert.match(write, /child\('enabled'\)\.val\(\) === true/);
  assert.match(write, /COMMAND_STATUS/);
  assert.match(write, /child\('farm_id'\)\.val\(\) === root\.child\('deviceRegistry'\)/);
});

test("only an enabled controller can create immutable system alerts", () => {
  const rules = json("firebase/database.rules.json") as { rules: Record<string, Record<string, unknown>> };
  const farm = rules.rules.farms as Record<string, Record<string, unknown>>;
  const alerts = farm.$farmId.alerts as Record<string, Record<string, unknown>>;
  const write = String(alerts.$alertId[".write"]);
  assert.match(write, /child\('enabled'\)\.val\(\) === true/);
  assert.match(write, /!data\.exists\(\)/);
});
