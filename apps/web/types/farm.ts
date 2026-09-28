export type Measurement = { value: number | null; valid: boolean; error?: string };
export type NodeCurrent = { measured_at: number; moisture: Measurement; temperature: Measurement; ec: Measurement; ph: Measurement; nitrogen: Measurement; phosphorus: Measurement; potassium: Measurement };
export type NodeRecord = { metadata?: { node_id: string; position: number; enabled: boolean }; status?: { state?: string; last_success_at?: number }; current?: NodeCurrent };
export type StandRecord = { metadata?: { name?: string }; controller?: { online?: boolean; last_seen?: number; wifi_rssi?: number }; nodes?: Record<string, NodeRecord> };
