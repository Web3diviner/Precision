"use client";

import { useState } from "react";
import {
  appCheckHeader,
  firebaseAuth,
  firebaseConfigured,
} from "../lib/firebase/client";

type Result = { tone: "idle" | "success" | "error"; message: string };
type OperationKind = "IRRIGATE" | "FERTIGATE";

const initialResult: Result = { tone: "idle", message: "" };
const configuredMaximum = Number(process.env.NEXT_PUBLIC_MAX_IRRIGATION_LITERS ?? 20);
const maxWaterLiters = Number.isFinite(configuredMaximum) && configuredMaximum > 0 ? configuredMaximum : 20;

export function OperationForm({ farmId, standId }: { farmId: string; standId: string }) {
  const [kind, setKind] = useState<OperationKind>("IRRIGATE");
  const [nodeId, setNodeId] = useState("NODE_01");
  const [liters, setLiters] = useState("5");
  const [nitrogen, setNitrogen] = useState("0");
  const [phosphorus, setPhosphorus] = useState("0");
  const [potassium, setPotassium] = useState("0");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(initialResult);

  function validateRequest(): boolean {
    const waterLiters = Number(liters);
    if (!Number.isFinite(waterLiters) || waterLiters <= 0 || waterLiters > maxWaterLiters) {
      setResult({ tone: "error", message: `Water must be between 0.1 and ${maxWaterLiters} L.` });
      return false;
    }

    if (kind === "FERTIGATE") {
      const doses = [Number(nitrogen), Number(phosphorus), Number(potassium)];
      if (doses.some((dose) => !Number.isFinite(dose) || dose < 0 || dose > 100)) {
        setResult({ tone: "error", message: "Each nutrient dose must be between 0 and 100 mL." });
        return false;
      }
    }

    return true;
  }

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(initialResult);
    if (validateRequest()) setConfirming(true);
  }

  async function createRequest() {
    if (!validateRequest()) {
      setConfirming(false);
      return;
    }

    const user = firebaseAuth?.currentUser;
    if (!firebaseConfigured || !user) {
      setConfirming(false);
      setResult({ tone: "error", message: "Sign in with an authorized farm account before creating a request." });
      return;
    }

    setPending(true);
    setResult(initialResult);
    try {
      const token = await user.getIdToken();
      const appCheck = await appCheckHeader();
      const waterLiters = Number(liters);
      const dosingMl = kind === "FERTIGATE"
        ? { nitrogen: Number(nitrogen), phosphorus: Number(phosphorus), potassium: Number(potassium) }
        : undefined;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/api/commands/${kind === "IRRIGATE" ? "irrigate" : "fertigate"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...appCheck },
          body: JSON.stringify({ farmId, standId, targetNodes: [nodeId], waterLiters, dosingMl }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      if (!response.ok) {
        const message = body.code === "MAX_IRRIGATION_EXCEEDED"
          ? `The server limit is ${maxWaterLiters} L per request.`
          : body.message ?? body.code ?? "The operation request could not be created.";
        setResult({ tone: "error", message });
        return;
      }
      setResult({ tone: "success", message: `${kind === "IRRIGATE" ? "Irrigation" : "Fertigation"} request created and awaiting controller receipt.` });
      setConfirming(false);
    } catch {
      setResult({ tone: "error", message: "Network error while creating the operation request." });
    } finally {
      setPending(false);
    }
  }

  const waterLiters = Number(liters);
  const doseSummary = kind === "FERTIGATE"
    ? `N ${nitrogen} mL · P ${phosphorus} mL · K ${potassium} mL`
    : null;

  return (
    <section className="panel" id="operation-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACTUATOR CONTROL</p>
          <h2>Request a field operation</h2>
        </div>
        <span className="status-pill">Human confirmation required</span>
      </div>
      <form className="operation-form" onSubmit={review}>
        <label>
          Operation type
          <select value={kind} onChange={(event) => { setKind(event.target.value as OperationKind); setConfirming(false); }}>
            <option value="IRRIGATE">Irrigation</option>
            <option value="FERTIGATE">Fertigation</option>
          </select>
        </label>
        <label>
          Target node
          <select value={nodeId} onChange={(event) => { setNodeId(event.target.value); setConfirming(false); }}>
            {Array.from({ length: 6 }, (_, index) => `NODE_${String(index + 1).padStart(2, "0")}`).map((node) => <option key={node}>{node}</option>)}
          </select>
        </label>
        <label>
          Water volume (L)
          <input type="number" min="0.1" max={maxWaterLiters} step="0.1" value={liters} onChange={(event) => { setLiters(event.target.value); setConfirming(false); }} required />
        </label>
        {kind === "FERTIGATE" ? (
          <fieldset>
            <legend>Nutrient dosing (mL)</legend>
            <label>N<input type="number" min="0" max="100" step="0.1" value={nitrogen} onChange={(event) => { setNitrogen(event.target.value); setConfirming(false); }} required /></label>
            <label>P<input type="number" min="0" max="100" step="0.1" value={phosphorus} onChange={(event) => { setPhosphorus(event.target.value); setConfirming(false); }} required /></label>
            <label>K<input type="number" min="0" max="100" step="0.1" value={potassium} onChange={(event) => { setPotassium(event.target.value); setConfirming(false); }} required /></label>
          </fieldset>
        ) : null}
        <button type="submit" disabled={pending}>{pending ? "Creating request…" : `Review ${kind === "IRRIGATE" ? "irrigation" : "fertigation"} request`}</button>
      </form>
      {confirming ? (
        <div className="notice" role="alertdialog" aria-modal="true" aria-labelledby="command-review-title" style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <p className="eyebrow">CONFIRM REQUEST</p>
          <h3 id="command-review-title" style={{ margin: 0 }}>Review field operation</h3>
          <p style={{ margin: 0 }}>Farm {farmId} · Stand {standId} · Target {nodeId}</p>
          <p style={{ margin: 0 }}>{kind === "IRRIGATE" ? "Irrigation" : "Fertigation"}: {Number.isFinite(waterLiters) ? waterLiters : liters} L{doseSummary ? ` · ${doseSummary}` : ""}</p>
          <p style={{ margin: 0 }}>This creates a pending command for the controller; it does not bypass controller safety checks.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button>
            <button type="button" onClick={() => void createRequest()} disabled={pending}>{pending ? "Creating request…" : `Confirm ${kind === "IRRIGATE" ? "irrigation" : "fertigation"}`}</button>
          </div>
        </div>
      ) : null}
      {result.message ? <p className={`form-result ${result.tone}`} role="status">{result.message}</p> : null}
    </section>
  );
}
