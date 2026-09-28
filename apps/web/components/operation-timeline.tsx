"use client";

import { limitToLast, onValue, orderByChild, query, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import { firebaseConfigured, firebaseDatabase } from "../lib/firebase/client";
import { useAuthSessionVersion } from "../lib/firebase/use-auth-session";

type Operation = { operation_id: string; type: "IRRIGATE" | "FERTIGATE"; status: string; target_nodes: string[]; water_liters: number; created_at: number; delivered_liters?: number; error_code?: string; error_message?: string };
const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function OperationTimeline({ farmId, standId }: { farmId: string; standId: string }) {
  const [operations, setOperations] = useState<Operation[]>([]); const [readError, setReadError] = useState(""); const authSessionVersion = useAuthSessionVersion();
  useEffect(() => { if (!firebaseDatabase) return; const source = query(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/operations`), orderByChild("created_at"), limitToLast(10)); return onValue(source, snapshot => { const value = snapshot.val() as Record<string, Operation> | null; setReadError(""); setOperations(value ? [...Object.values(value)].sort((a, b) => b.created_at - a.created_at) : []); }, () => { setOperations([]); setReadError("Sign in to load authorized operation history."); }); }, [farmId, standId, authSessionVersion]);
  const message = useMemo(() => !firebaseConfigured ? "Configure Firebase to view operation history." : readError || (!operations.length ? "No operation records for this Stand." : ""), [operations.length, readError]);
  return <section className="panel"><div className="section-head"><div><p className="eyebrow">OPERATION TIMELINE</p><h2>Controller-confirmed progress</h2></div><span className="badge">Last 10</span></div>{message ? <p className="lede">{message}</p> : <ol>{operations.map(operation => <li key={operation.operation_id}><strong>{operation.type} · {operation.target_nodes.join(", ")}</strong><span>{operation.water_liters} L requested · {new Date(operation.created_at).toLocaleString()}</span><b>{operation.status}</b>{operation.delivered_liters !== undefined ? <small>{operation.delivered_liters} L verified</small> : null}{terminal.has(operation.status) && operation.error_code ? <small>{operation.error_message ? `${operation.error_code}: ${operation.error_message}` : operation.error_code}</small> : null}</li>)}</ol>}</section>;
}
