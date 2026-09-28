"use client";

import { onValue, ref } from "firebase/database";
import Link from "next/link";
import { useEffect, useState } from "react";
import { firebaseConfigured, firebaseDatabase } from "../lib/firebase/client";
import { useAuthSessionVersion } from "../lib/firebase/use-auth-session";
import type { NodeRecord, StandRecord } from "../types/farm";

const demo: StandRecord = { metadata: { name: "Stand 01" }, controller: { online: true, last_seen: Date.now(), wifi_rssi: -58 }, nodes: Object.fromEntries(Array.from({ length: 6 }, (_, index) => { const position = index + 1; const valid = position !== 4; return [`NODE_${String(position).padStart(2, "0")}`, { metadata: { node_id: `NODE_${String(position).padStart(2, "0")}`, position, enabled: true }, status: { state: valid ? "ONLINE" : "MODBUS_TIMEOUT" }, current: { measured_at: Date.now(), moisture: { value: [31.2, 18.4, 37, null, 29.1, 33.8][index], valid }, temperature: { value: 27.4, valid }, ec: { value: 820, valid }, ph: { value: 6.3, valid }, nitrogen: { value: 30, valid }, phosphorus: { value: 18, valid }, potassium: { value: 41, valid } } }]; })) };
const statusFor = (node: NodeRecord) => !node.current?.moisture.valid ? "sensor" : (node.current.moisture.value ?? 100) < 22 ? "attention" : "healthy";

export function LiveStand({ farmId, standId }: { farmId: string; standId: string }) {
  const [stand, setStand] = useState<StandRecord>(demo);
  const [source, setSource] = useState("Demo data");
  const [readError, setReadError] = useState("");
  const authSessionVersion = useAuthSessionVersion();
  useEffect(() => {
    if (!firebaseDatabase) return;
    setSource("Demo data"); setReadError("");
    const denied = () => { setSource("Demo data"); setReadError("Sign in to load authorized live telemetry."); };
    const controller = onValue(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/controller`), snapshot => { if (snapshot.exists()) { setStand(previous => ({ ...previous, controller: snapshot.val() })); setSource("Live telemetry"); } }, denied);
    const nodes = onValue(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/nodes`), snapshot => { if (snapshot.exists()) { setStand(previous => ({ ...previous, nodes: snapshot.val() })); setSource("Live telemetry"); } }, denied);
    return () => { controller(); nodes(); };
  }, [farmId, standId, authSessionVersion]);
  const nodes = Object.entries(stand.nodes ?? {});
  const controllerOnline = source === "Live telemetry" && stand.controller?.online;
  return <section className="panel"><div className="section-head"><div><p className="eyebrow">{standId} · {source}</p><h2>Six-node root-zone map</h2></div><span className={controllerOnline ? "badge online" : "badge"}>{source === "Live telemetry" ? controllerOnline ? "Controller online" : "Controller offline" : "Demo state"}</span></div><div className="field-map"><div className="controller">ESP32<small>{stand.controller?.wifi_rssi ?? "—"} dBm</small></div>{nodes.map(([id, node]) => <Link className={`node ${statusFor(node)}`} href={`/nodes/${id}`} key={id}><b>{node.metadata?.position ?? "—"}</b><span><strong>{id}</strong><small>{node.current?.moisture.valid ? `${node.current.moisture.value}% moisture` : node.current?.moisture.error ?? "Sensor error"}</small></span></Link>)}</div><p className="hint">Last updated: {source === "Live telemetry" && stand.controller?.last_seen ? new Date(stand.controller.last_seen).toLocaleString() : "Demo timestamp"}</p>{readError ? <p className="notice">{readError}</p> : !firebaseConfigured ? <p className="notice">Configure Firebase environment values to replace the safe demo data with live telemetry.</p> : null}</section>;
}
