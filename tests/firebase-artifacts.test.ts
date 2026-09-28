import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("Firebase deploy manifest selects the active farm-scoped rules and indexes", () => {
  const config = json("firebase.json") as { database?: { rules?: string; indexes?: string } };
  assert.equal(config.database?.rules, "firebase/database.rules.json");
  assert.equal(config.database?.indexes, "firebase/database.indexes.json");
});

test("retired root rules files fail closed", () => {
  for (const file of ["database.rules.json", "firebase-rules.template.json"]) {
    const rules = json(file) as { rules?: { ".read"?: boolean; ".write"?: boolean } };
    assert.equal(rules.rules?.[".read"], false, `${file} must not grant reads`);
    assert.equal(rules.rules?.[".write"], false, `${file} must not grant writes`);
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

test("only an enabled controller can create immutable system alerts", () => {
  const rules = json("firebase/database.rules.json") as { rules: Record<string, Record<string, unknown>> };
  const farm = rules.rules.farms as Record<string, Record<string, unknown>>;
  const alerts = farm.$farmId.alerts as Record<string, Record<string, unknown>>;
  const write = String(alerts.$alertId[".write"]);
  assert.match(write, /child\('enabled'\)\.val\(\) === true/);
  assert.match(write, /!data\.exists\(\)/);
});
