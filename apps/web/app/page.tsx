import { AlertFeed } from "../components/alert-feed";
import { AuthPanel } from "../components/auth-panel";
import { LiveStand } from "../components/live-stand";
import { OperationForm } from "../components/operation-form";
import { OperationTimeline } from "../components/operation-timeline";
import { OverviewMetrics } from "../components/overview-metrics";

const farmId = process.env.NEXT_PUBLIC_DEFAULT_FARM_ID ?? "FARM_001";
const standId = "STAND_01";

export default function Dashboard() {
  return <main><header className="topbar"><div><p className="eyebrow">FARM_001 / DAILY FIELD PULSE</p><h1>Know the soil<br /><em>before it asks.</em></h1><p className="lede">Live root-zone telemetry, controller health, and auditable operations across every stand.</p></div><div className="header-status"><span className="badge online">Live system</span><small>26 September · WAT</small></div></header><OverviewMetrics farmId={farmId} standId={standId} /><div id="stand-map"><LiveStand farmId={farmId} standId={standId} /></div><div className="dashboard-grid"><div id="alerts"><AlertFeed farmId={farmId} /></div><div><AuthPanel /><OperationForm farmId={farmId} standId={standId} /></div></div><div id="operations"><OperationTimeline farmId={farmId} standId={standId} /></div></main>;
}
