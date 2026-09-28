"use client";

import { useEffect, useState } from "react";
import { firebaseAuth } from "../lib/firebase/client";
import { useAuthSessionVersion } from "../lib/firebase/use-auth-session";
import { AlertFeed } from "./alert-feed";
import { AuthPanel } from "./auth-panel";
import { LiveStand } from "./live-stand";
import { OperationForm } from "./operation-form";
import { OperationTimeline } from "./operation-timeline";
import { OverviewMetrics } from "./overview-metrics";

type Farm = { id: string; metadata?: { name?: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function Dashboard({ defaultFarmId }: { defaultFarmId: string }) {
  const [farmId, setFarmId] = useState(defaultFarmId);
  const [standId, setStandId] = useState("STAND_01");
  const [farms, setFarms] = useState<Farm[]>([]);
  const [stands, setStands] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const authSessionVersion = useAuthSessionVersion();

  useEffect(() => {
    const user = firebaseAuth?.currentUser;
    if (!user) { setFarms([]); setStands([]); setSelectionError(""); return; }
    let active = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${apiBase}/api/farms`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("Unable to load authorized farms.");
        const records = (await response.json()) as Farm[];
        if (!active) return;
        setFarms(records);
        if (records.length && !records.some((farm) => farm.id === farmId)) setFarmId(records[0].id);
      } catch (error) { if (active) setSelectionError(error instanceof Error ? error.message : "Unable to load authorized farms."); }
    })();
    return () => { active = false; };
  }, [authSessionVersion, farmId]);

  useEffect(() => {
    const user = firebaseAuth?.currentUser;
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${apiBase}/api/farms/${encodeURIComponent(farmId)}/stands`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("Unable to load authorized stands.");
        const ids = Object.keys((await response.json()) as Record<string, unknown>).sort();
        if (!active) return;
        setStands(ids);
        if (ids.length && !ids.includes(standId)) setStandId(ids[0]);
      } catch (error) { if (active) setSelectionError(error instanceof Error ? error.message : "Unable to load authorized stands."); }
    })();
    return () => { active = false; };
  }, [authSessionVersion, farmId, standId]);

  return <main>
    <header className="topbar"><div><p className="eyebrow">{farmId} / {standId} / DAILY FIELD PULSE</p><h1>Know the soil<br /><em>before it asks.</em></h1><p className="lede">Live root-zone telemetry, controller health, and auditable operations across every authorized stand.</p></div><div className="header-status"><span className="badge online">Live system</span><small>Authenticated farm workspace</small></div></header>
    <section className="panel" aria-label="Farm and stand selection"><div className="section-head"><div><p className="eyebrow">WORKSPACE</p><h2>Farm context</h2></div><span className="status-pill">Role-authorized</span></div><div className="operation-form"><label>Farm<select value={farmId} onChange={(event) => setFarmId(event.target.value)} disabled={!farms.length}>{farms.length ? farms.map((farm) => <option value={farm.id} key={farm.id}>{farm.metadata?.name ? `${farm.metadata.name} (${farm.id})` : farm.id}</option>) : <option value={farmId}>{farmId}</option>}</select></label><label>Stand<select value={standId} onChange={(event) => setStandId(event.target.value)} disabled={!stands.length}>{stands.length ? stands.map((id) => <option value={id} key={id}>{id}</option>) : <option value={standId}>{standId}</option>}</select></label></div>{selectionError ? <p className="notice">{selectionError}</p> : null}</section>
    <OverviewMetrics farmId={farmId} standId={standId} />
    <div id="stand-map"><LiveStand farmId={farmId} standId={standId} /></div>
    <div className="dashboard-grid"><div id="alerts"><AlertFeed farmId={farmId} /></div><div><AuthPanel /><OperationForm farmId={farmId} standId={standId} /></div></div>
    <div id="operations"><OperationTimeline farmId={farmId} standId={standId} /></div>
  </main>;
}
