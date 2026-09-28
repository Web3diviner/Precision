import Link from "next/link";
import { LiveNode } from "../../../components/live-node";
import { TelemetryHistory } from "../../../components/telemetry-history";

const farmId = process.env.NEXT_PUBLIC_DEFAULT_FARM_ID ?? "FARM_001";

export default async function NodePage({ params }: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await params;
  return <main><Link className="back" href="/">← Farm overview</Link><header><div><p className="eyebrow">{farmId} · STAND_01 · {nodeId}</p><h1>Node field record</h1><p className="lede">Current values appear only after a valid probe reading. Invalid readings are never converted to zero.</p></div><span className="badge">Live status</span></header><LiveNode farmId={farmId} standId="STAND_01" nodeId={nodeId} /><TelemetryHistory farmId={farmId} standId="STAND_01" nodeId={nodeId} /><section className="panel"><p className="eyebrow">CONTROL SAFETY</p><h2>Operations are API-authorized</h2><p className="lede">Requests require an authenticated role, an online controller, exact Farm/Stand/Node targeting, expiry, and device acknowledgement before completion is shown.</p></section></main>;
}
