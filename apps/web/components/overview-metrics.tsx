"use client";

import { onValue, ref } from "firebase/database";
import { useEffect, useState } from "react";
import { firebaseDatabase } from "../lib/firebase/client";
import { useAuthSessionVersion } from "../lib/firebase/use-auth-session";
import type { NodeCurrent, StandRecord } from "../types/farm";

const reading = (valid: boolean) => ({ value: valid ? 30 : null, valid });
const demoCurrent = (valid: boolean): NodeCurrent => ({ measured_at: Date.now(), moisture: reading(valid), temperature: reading(valid), ec: reading(valid), ph: reading(valid), nitrogen: reading(valid), phosphorus: reading(valid), potassium: reading(valid) });
const initial: StandRecord = { controller: { online: true }, nodes: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`NODE_${String(index + 1).padStart(2, "0")}`, { current: demoCurrent(index !== 3) }])) };

export function OverviewMetrics({ farmId, standId }: { farmId: string; standId: string }) {
  const [stand, setStand] = useState<StandRecord>(initial);
  const [live, setLive] = useState(false);
  const authSessionVersion = useAuthSessionVersion();
  useEffect(() => {
    if (!firebaseDatabase) return;
    setLive(false);
    const denied = () => setLive(false);
    const controller = onValue(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/controller`), snapshot => { if (snapshot.exists()) { setStand(previous => ({ ...previous, controller: snapshot.val() })); setLive(true); } }, denied);
    const nodes = onValue(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/nodes`), snapshot => { if (snapshot.exists()) { setStand(previous => ({ ...previous, nodes: snapshot.val() })); setLive(true); } }, denied);
    return () => { controller(); nodes(); };
  }, [farmId, standId, authSessionVersion]);
  const nodes = Object.values(stand.nodes ?? {}); const healthy = nodes.filter(node => node.current?.moisture.valid).length; const attention = nodes.length - healthy;
  return <section className="metrics"><article><span>STANDS ONLINE</span><strong>{live && stand.controller?.online ? "1" : "—"}</strong><p>{live ? stand.controller?.online ? "Controller reporting" : "Controller offline" : "Sign in for live status"}</p></article><article><span>NODES HEALTHY</span><strong>{live ? healthy : "—"}{live ? <small> / {nodes.length || 6}</small> : null}</strong><p>{live ? attention ? `${attention} needs review` : "All sensor readings valid" : "Awaiting authorized telemetry"}</p></article><article><span>COMMAND PATH</span><strong>Safe</strong><p>Server-authorized only</p></article></section>;
}
