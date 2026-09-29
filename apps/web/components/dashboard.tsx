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
type Stand = { id: string; metadata?: { name?: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const previewFarms: Farm[] = Array.from({ length: 10 }, (_, index) => ({ id: `FARM_${String(index + 1).padStart(3, "0")}`, metadata: { name: `Farm ${index + 1}` } }));
const previewStands: Stand[] = Array.from({ length: 10 }, (_, index) => ({ id: `STAND_${String(index + 1).padStart(2, "0")}`, metadata: { name: `Block ${index + 1}` } }));

export function Dashboard({ defaultFarmId }: { defaultFarmId: string }) {
  const [farmId, setFarmId] = useState(defaultFarmId);
  const [standId, setStandId] = useState("STAND_01");
  const [farms, setFarms] = useState<Farm[]>(previewFarms);
  const [stands, setStands] = useState<Stand[]>(previewStands);
  const [directoryMode, setDirectoryMode] = useState<"preview" | "authorized">("preview");
  const [selectionError, setSelectionError] = useState("");
  const authSessionVersion = useAuthSessionVersion();

  useEffect(() => {
    const user = firebaseAuth?.currentUser;
    if (!user) { setFarms(previewFarms); setStands(previewStands); setDirectoryMode("preview"); setSelectionError(""); return; }
    let active = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${apiBase}/api/farms`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("Unable to load authorized farms.");
        const records = (await response.json()) as Farm[];
        if (!active) return;
        setFarms(records);
        setDirectoryMode("authorized");
        if (records.length) setFarmId((current) => records.some((farm) => farm.id === current) ? current : records[0].id);
      } catch (error) { if (active) { setFarms(previewFarms); setStands(previewStands); setDirectoryMode("preview"); setSelectionError(error instanceof Error ? error.message : "Unable to load authorized farms."); } }
    })();
    return () => { active = false; };
  }, [authSessionVersion]);

  useEffect(() => {
    const user = firebaseAuth?.currentUser;
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${apiBase}/api/farms/${encodeURIComponent(farmId)}/stands`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("Unable to load authorized stands.");
        const records = Object.entries((await response.json()) as Record<string, { metadata?: { name?: string } }>).map<Stand>(([id, stand]) => ({ id, metadata: stand.metadata }));
        records.sort((left, right) => left.id.localeCompare(right.id));
        if (!active) return;
        setStands(records);
        if (records.length) setStandId((current) => records.some((stand) => stand.id === current) ? current : records[0].id);
      } catch (error) { if (active) setSelectionError(error instanceof Error ? error.message : "Unable to load authorized stands."); }
    })();
    return () => { active = false; };
  }, [authSessionVersion, farmId]);

  return <main>
    <header className="topbar"><div><p className="eyebrow">{farmId} / {standId} / DAILY FIELD PULSE</p><h1>Know the soil<br /><em>before it asks.</em></h1><p className="lede">Live root-zone telemetry, controller health, and auditable operations across every authorized stand.</p></div><div className="header-status"><span className="badge online">Live system</span><small>Authenticated farm workspace</small></div></header>
    <section className="panel" aria-label="Farm and stand selection"><div className="section-head"><div><p className="eyebrow">WORKSPACE</p><h2>Farm context</h2></div><span className="status-pill">{directoryMode === "authorized" ? "Role-authorized" : "Preview directory"}</span></div><div className="operation-form"><label>Farm<select value={farmId} onChange={(event) => setFarmId(event.target.value)}>{farms.map((farm) => <option value={farm.id} key={farm.id}>{farm.metadata?.name ? `${farm.metadata.name} (${farm.id})` : farm.id}</option>)}</select></label><label>Stand<select value={standId} onChange={(event) => setStandId(event.target.value)}>{stands.map((stand) => <option value={stand.id} key={stand.id}>{stand.metadata?.name ? `${stand.metadata.name} (${stand.id})` : stand.id}</option>)}</select></label></div>{directoryMode === "preview" ? <p className="notice">Preview up to 10 Farms and 10 Stands. Sign in to load only your authorized live workspace.</p> : null}{selectionError ? <p className="notice">{selectionError}</p> : null}</section>
    <OverviewMetrics farmId={farmId} standId={standId} />
    <div id="stand-map"><LiveStand farmId={farmId} standId={standId} /></div>
    <div className="dashboard-grid"><div id="alerts"><AlertFeed farmId={farmId} /></div><div><AuthPanel /><OperationForm farmId={farmId} standId={standId} /></div></div>
    <div id="operations"><OperationTimeline farmId={farmId} standId={standId} /></div>
  </main>;
}
