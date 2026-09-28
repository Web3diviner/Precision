"use client";

import { endAt, limitToLast, onValue, orderByChild, query, ref, startAt } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import { firebaseConfigured, firebaseDatabase } from "../lib/firebase/client";
import { useAuthSessionVersion } from "../lib/firebase/use-auth-session";
import type { Measurement } from "../types/farm";

type Log = { measured_at: number; moisture?: Measurement; temperature?: Measurement; ec?: Measurement; ph?: Measurement };
const ranges = [{ label: "1H", ms: 3_600_000 }, { label: "24H", ms: 86_400_000 }, { label: "7D", ms: 604_800_000 }, { label: "30D", ms: 2_592_000_000 }] as const;
const day = (date: Date) => date.toISOString().slice(0, 10);

export function TelemetryHistory({ farmId, standId, nodeId }: { farmId: string; standId: string; nodeId: string }) {
  const [window, setWindow] = useState({ label: "24H", start: Date.now() - ranges[1].ms, end: Date.now() });
  const [startDate, setStartDate] = useState(day(new Date(Date.now() - ranges[1].ms)));
  const [endDate, setEndDate] = useState(day(new Date()));
  const [rangeError, setRangeError] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [readError, setReadError] = useState("");
  const authSessionVersion = useAuthSessionVersion();
  useEffect(() => { if (!firebaseDatabase) return; const source = query(ref(firebaseDatabase, `farms/${farmId}/stands/${standId}/nodes/${nodeId}/logs`), orderByChild("measured_at"), startAt(window.start), endAt(window.end), limitToLast(500)); return onValue(source, snapshot => { const value = snapshot.val() as Record<string, Log> | null; setReadError(""); setLogs(value ? Object.values(value).sort((a, b) => a.measured_at - b.measured_at) : []); }, () => { setLogs([]); setReadError("Sign in to load authorized telemetry history."); }); }, [farmId, standId, nodeId, window, authSessionVersion]);
  const latest = logs.at(-1); const validCount = useMemo(() => logs.filter(log => log.moisture?.valid).length, [logs]);
  const moistureSeries = useMemo(() => logs.flatMap(log => log.moisture?.valid && typeof log.moisture.value === "number" ? [{ at: log.measured_at, value: log.moisture.value }] : []), [logs]);
  const chart = useMemo(() => {
    if (moistureSeries.length < 2) return null;
    const values = moistureSeries.map(point => point.value); const low = Math.max(0, Math.floor(Math.min(...values) - 2)); const high = Math.min(100, Math.ceil(Math.max(...values) + 2)); const span = Math.max(high - low, 1); const first = moistureSeries[0].at; const last = moistureSeries.at(-1)!.at; const timeSpan = Math.max(last - first, 1);
    const points = moistureSeries.map(point => `${24 + ((point.at - first) / timeSpan) * 752},${196 - ((point.value - low) / span) * 164}`).join(" ");
    return { low, high, points, area: `24,196 ${points} 776,196` };
  }, [moistureSeries]);
  function choosePreset(option: (typeof ranges)[number]) { const now = Date.now(); setWindow({ label: option.label, start: now - option.ms, end: now }); setRangeError(""); }
  function applyCustomRange(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const start = new Date(`${startDate}T00:00:00`).getTime(); const end = new Date(`${endDate}T23:59:59.999`).getTime(); if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return setRangeError("Choose an end date after the start date."); setWindow({ label: "Custom", start, end }); setRangeError(""); }
  return <section className="panel"><div className="section-head"><div><p className="eyebrow">HISTORICAL TELEMETRY</p><h2>Indexed measurement window</h2></div><div>{ranges.map(option => <button type="button" onClick={() => choosePreset(option)} aria-pressed={window.label === option.label} key={option.label}>{option.label}</button>)}</div></div><form onSubmit={applyCustomRange} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}><label>From<input type="date" value={startDate} max={endDate} onChange={event => setStartDate(event.target.value)} /></label><label>To<input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} /></label><button type="submit">View custom range</button></form>{rangeError ? <p role="status" data-tone="error">{rangeError}</p> : null}{!firebaseConfigured ? <p className="lede">Configure Firebase to load history.</p> : readError ? <p className="lede">{readError}</p> : !logs.length ? <p className="lede">No readings in the {window.label.toLowerCase()} window.</p> : <><p className="lede">{logs.length} records · {validCount} valid moisture readings · latest at {new Date(latest!.measured_at).toLocaleString()}</p>{chart ? <div style={{ marginTop: 20, padding: "14px 0 2px", borderTop: "1px solid #d6dfd8" }}><div style={{ display: "flex", justifyContent: "space-between", color: "#6a7d78", fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}><span>MOISTURE TREND</span><span>{chart.low}%—{chart.high}%</span></div><svg viewBox="0 0 800 220" role="img" aria-label="Moisture trend over the selected window" style={{ display: "block", width: "100%", height: "auto", marginTop: 8 }}><path d="M24 32H776M24 114H776M24 196H776" stroke="#d6dfd8" strokeDasharray="3 7" /><polygon points={chart.area} fill="#d9f3ef" /><polyline points={chart.points} fill="none" stroke="#18a8a3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><text x="0" y="36" fill="#6a7d78" fontSize="11">{chart.high}%</text><text x="0" y="200" fill="#6a7d78" fontSize="11">{chart.low}%</text></svg></div> : <p className="hint">At least two valid moisture readings are needed to draw a trend.</p>}<table><thead><tr><th>Time</th><th>Moisture</th><th>Temperature</th><th>EC</th><th>pH</th></tr></thead><tbody>{logs.slice(-12).reverse().map(log => <tr key={log.measured_at}><td>{new Date(log.measured_at).toLocaleString()}</td><td>{log.moisture?.valid ? `${log.moisture.value}%` : log.moisture?.error ?? "Invalid"}</td><td>{log.temperature?.valid ? `${log.temperature.value} °C` : "Invalid"}</td><td>{log.ec?.valid ? log.ec.value : "Invalid"}</td><td>{log.ph?.valid ? log.ph.value : "Invalid"}</td></tr>)}</tbody></table></>}</section>;
}
