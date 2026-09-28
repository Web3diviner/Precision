"use client";

import { onValue, ref } from "firebase/database";
import { useEffect, useState } from "react";
import { firebaseConfigured, firebaseDatabase } from "../lib/firebase/client";
import { useAuthSessionVersion } from "../lib/firebase/use-auth-session";
import type { Measurement, NodeRecord } from "../types/farm";

const fields: Array<[string, keyof NonNullable<NodeRecord["current"]>, string]> = [["Moisture", "moisture", "%"], ["Temperature", "temperature", "°C"], ["EC", "ec", "µS/cm"], ["pH", "ph", ""], ["Nitrogen", "nitrogen", "unit TBC"], ["Phosphorus", "phosphorus", "unit TBC"], ["Potassium", "potassium", "unit TBC"]];
const display = (measurement: Measurement | undefined) => measurement?.valid ? String(measurement.value) : measurement?.error ?? "No valid reading";

export function LiveNode({ farmId, standId, nodeId }: { farmId: string; standId: string; nodeId: string }) {
  const [node, setNode] = useState<NodeRecord | null>(null);
  const [readError, setReadError] = useState("");
  const authSessionVersion = useAuthSessionVersion();
  useEffect(() => { if (!firebaseDatabase) return; setReadError(""); return onValue(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/nodes/${nodeId}`), snapshot => { setNode(snapshot.exists() ? snapshot.val() as NodeRecord : null); }, () => { setNode(null); setReadError("Sign in to load authorized node telemetry."); }); }, [farmId, standId, nodeId, authSessionVersion]);
  const current = node?.current;
  return <><section className="metric-grid">{fields.map(([label, key, unit]) => <article key={label}><span>{label}</span><strong>{display(current?.[key] as Measurement | undefined)}</strong><small>{unit}</small></article>)}</section><section className="panel"><p className="eyebrow">TELEMETRY STATUS</p><h2>{current ? "Current node reading" : "No node record yet"}</h2><p className="lede">{current?.measured_at ? `Measured ${new Date(current.measured_at).toLocaleString()}.` : readError || (firebaseConfigured ? "Waiting for this controller to publish telemetry." : "Configure Firebase to subscribe to live telemetry.")}</p></section></>;
}
