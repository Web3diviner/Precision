import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Rootline | Farm operations", description: "Precision farming telemetry and operations" };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="app-shell"><aside className="rail"><Link href="/" className="brand"><i>R</i><span>rootline<small>FIELD OPERATIONS</small></span></Link><nav><Link href="/" className="active">Overview</Link><a href="#stand-map">Stands</a><a href="#alerts">Alerts</a><a href="#operations">Operations</a><Link href="/nodes/NODE_01">Analytics</Link></nav><div className="rail-footer"><span>FARM_001</span><b>● System monitored</b><small>Precision farming platform</small></div></aside>{children}</div></body></html>;
}
