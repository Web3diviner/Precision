"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("dashboard_render_failed", { message: error.message, digest: error.digest }); }, [error]);
  return <main><section className="panel" style={{ maxWidth: 680, margin: "12vh auto" }}><p className="eyebrow">DASHBOARD RECOVERY</p><h1>We could not load this workspace.</h1><p className="lede">No operation was created. Check your connection, then retry the dashboard.</p><button type="button" onClick={reset}>Retry dashboard</button></section></main>;
}
