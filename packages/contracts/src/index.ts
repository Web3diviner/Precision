import { z } from "zod";

export const nodeIdSchema = z.string().regex(/^NODE_\d{2}$/);
export const standIdSchema = z.string().regex(/^STAND_\d{2}$/);
export const farmIdSchema = z.string().regex(/^FARM_\d{3}$/);
export const commandStatusSchema = z.enum(["PENDING", "RECEIVED", "EXECUTING", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED"]);
export const readingSchema = z.object({ value: z.number().nullable(), valid: z.boolean(), error: z.string().optional() });
export const telemetrySchema = z.object({ measured_at: z.number().int().positive(), sequence: z.number().int().nonnegative(), moisture: readingSchema, temperature: readingSchema, ec: readingSchema, ph: readingSchema, nitrogen: readingSchema, phosphorus: readingSchema, potassium: readingSchema });
export const irrigationRequestSchema = z.object({ farmId: farmIdSchema, standId: standIdSchema, targetNodes: z.array(nodeIdSchema).min(1).max(6).refine(nodes => new Set(nodes).size === nodes.length, "Target nodes must be unique"), waterLiters: z.number().positive().max(10_000) });
export const fertigationRequestSchema = irrigationRequestSchema.extend({ dosingMl: z.object({ nitrogen: z.number().min(0).max(100), phosphorus: z.number().min(0).max(100), potassium: z.number().min(0).max(100) }) });
export type Telemetry = z.infer<typeof telemetrySchema>;
