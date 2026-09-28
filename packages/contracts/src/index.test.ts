import assert from "node:assert/strict";
import test from "node:test";
import { fertigationRequestSchema, irrigationRequestSchema, telemetrySchema } from "./index.js";

const telemetry = {
  measured_at: 1_726_000_000_000,
  sequence: 42,
  moisture: { value: 28.4, valid: true },
  temperature: { value: 26.2, valid: true },
  ec: { value: 740, valid: true },
  ph: { value: 6.4, valid: true },
  nitrogen: { value: null, valid: false, error: "SENSOR_TIMEOUT" },
  phosphorus: { value: 18, valid: true },
  potassium: { value: 41, valid: true },
};

test("accepts the complete seven-reading telemetry contract", () => {
  assert.equal(telemetrySchema.safeParse(telemetry).success, true);
});

test("rejects incomplete telemetry and invalid node identifiers", () => {
  const { potassium: _potassium, ...incomplete } = telemetry;
  assert.equal(telemetrySchema.safeParse(incomplete).success, false);
  assert.equal(irrigationRequestSchema.safeParse({ farmId: "FARM_001", standId: "STAND_01", targetNodes: ["NODE_7"], waterLiters: 2 }).success, false);
});

test("requires a positive bounded irrigation payload", () => {
  const base = { farmId: "FARM_001", standId: "STAND_01", targetNodes: ["NODE_01"], waterLiters: 2 };
  assert.equal(irrigationRequestSchema.safeParse(base).success, true);
  assert.equal(irrigationRequestSchema.safeParse({ ...base, waterLiters: 0 }).success, false);
  assert.equal(irrigationRequestSchema.safeParse({ ...base, waterLiters: 10_001 }).success, false);
  assert.equal(irrigationRequestSchema.safeParse({ ...base, targetNodes: ["NODE_01", "NODE_01"] }).success, false);
});

test("requires all fertilizer dosing channels", () => {
  const request = { farmId: "FARM_001", standId: "STAND_01", targetNodes: ["NODE_01"], waterLiters: 2, dosingMl: { nitrogen: 10, phosphorus: 5, potassium: 8 } };
  assert.equal(fertigationRequestSchema.safeParse(request).success, true);
  assert.equal(fertigationRequestSchema.safeParse({ ...request, dosingMl: { nitrogen: 10, phosphorus: 5 } }).success, false);
});
