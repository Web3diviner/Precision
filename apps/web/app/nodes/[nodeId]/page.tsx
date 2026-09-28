import Link from "next/link";
import { LiveNode } from "../../../components/live-node";
import { TelemetryHistory } from "../../../components/telemetry-history";

const defaultFarmId = process.env.NEXT_PUBLIC_DEFAULT_FARM_ID ?? "FARM_001";
const validFarmId = (value: string | undefined) => /^FARM_\d{3}$/.test(value ?? "") ? value! : defaultFarmId;
const validStandId = (value: string | undefined) => /^STAND_\d{2}$/.test(value ?? "") ? value! : "STAND_01";

export default async function NodePage({ params, searchParams }: { params: Promise<{ nodeId: string }>; searchParams: Promise<{ farmId?: string; standId?: string }> }) {
  const [{ nodeId }, query] = await Promise.all([params, searchParams]);
  const farmId = validFarmId(query.farmId);
  const standId = validStandId(query.standId);
  return <main><Link className="back" href="/">← Farm overview</Link><header><div><p className="eyebrow">{farmId} · {standId} · {nodeId}</p><h1>Node field record</h1><p className="lede">Current values appear only after a valid probe reading. Invalid readings are never converted to zero.</p></div><span className="badge">Live status</span></header><LiveNode farmId={farmId} standId={standId} nodeId={nodeId} /><TelemetryHistory farmId={farmId} standId={standId} nodeId={nodeId} /><section className="panel"><p className="eyebrow">CONTROL SAFETY</p><h2>Operations are API-authorized</h2><p className="lede">Requests require an authenticated role, an online controller, exact Farm/Stand/Node targeting, expiry, and device acknowledgement before completion is shown.</p></section></main>;
}
