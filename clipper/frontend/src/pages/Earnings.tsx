import { DollarSign, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, Empty, ErrorBox, Field, Input, NumberInput, PageHeader, Select, Spinner, useLoad } from "../components/ui";
import { del, fmtDate, get, money, post, type Campaign, type Submission } from "../services/api";
import { useApp } from "../stores/app";

const COLS: [string, string][] = [["submissions", "Submitted clips"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"],
  ["self_reported_views", "Self-reported views"], ["verified_views", "Verified views"], ["estimated", "Estimated"], ["received", "Received"]];

function Table({ rows, first, label }: { rows: any[]; first: string; label: string }) {
  const cell = (r: any, k: string) => (k === "estimated" || k === "received" ? money(r[k], r.currency) : k === "submissions" ? r.submissions - r.pending : r[k].toLocaleString());
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 pr-4 font-medium">{label}</th>{COLS.map(([k, l]) => <th key={k} className="px-2 py-2 text-right font-medium">{l}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r[first]} className="border-b border-line/50"><td className="py-2 pr-4">{r[first]}</td>{COLS.map(([k]) => <td key={k} className="px-2 py-2 text-right tabular-nums">{cell(r, k)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Earnings() {
  const toast = useApp((s) => s.toast);
  const [e, reload, error] = useLoad(() => get("/api/earnings"));
  const [campaigns] = useLoad(() => get<Campaign[]>("/api/campaigns"));
  const [subs] = useLoad(() => get<Submission[]>("/api/submissions"));
  const [pay, setPay] = useState<{ campaign_id: number | ""; submission_id: number | ""; amount: number | null; received_at: string; note: string }>({ campaign_id: "", submission_id: "", amount: null, received_at: "", note: "" });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const csv = useRef<HTMLInputElement>(null);
  const [csvKind, setCsvKind] = useState<"metrics" | "payments">("payments");
  if (error) return <ErrorBox text={error} />;
  if (!e || !campaigns || !subs) return <Spinner />;
  const t = e.totals;
  const addPayment = () => post("/api/payments", { campaign_id: pay.campaign_id, submission_id: pay.submission_id || null, amount: pay.amount, received_at: pay.received_at || null, note: pay.note })
    .then(() => { setPay({ ...pay, amount: null, note: "" }); reload(); toast("Payment recorded"); }).catch((err) => toast(err.message, "error"));
  const importCsv = (f?: File) => {
    if (!f) return;
    const form = new FormData();
    form.append("file", f);
    post(`/api/earnings/import?kind=${csvKind}`, form).then((r) => { setImportErrors(r.errors); toast(`Imported ${r.imported} row${r.imported === 1 ? "" : "s"}${r.errors.length ? `, ${r.errors.length} skipped` : ""}`, r.errors.length ? "error" : "ok"); reload(); })
      .catch((err) => toast(err.message, "error"));
  };
  const big = (label: string, value: string, note: string, tone = "") => (
    <Card className="!p-4"><div className="text-xs text-muted">{label}</div><div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div><div className="mt-0.5 text-[11px] text-muted">{note}</div></Card>
  );
  return (
    <>
      <PageHeader title="Earnings" subtitle="Four different numbers, kept apart: views you reported, views a campaign verified, what that would pay, and money that actually arrived." />
      {!campaigns.length ? <Empty icon={<DollarSign className="size-8" />} title="Nothing to track yet" text="Create a campaign and record a submission first." /> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {big("Self-reported views", t.self_reported_views.toLocaleString(), "Counts you typed in or imported")}
          {big("Verified views", t.verified_views.toLocaleString(), "Counts you marked as verified by the campaign")}
          {big("Estimated earnings", money(t.estimated), "Calculated from views and each campaign's pay rule. Not a payment.", "text-warn")}
          {big("Actually received", money(t.received), "Sum of the payments you recorded below", "text-good")}
        </div>
        {new Set(campaigns.map((c) => c.currency)).size > 1 && <p className="mt-2 text-xs text-warn">Your campaigns use different currencies. The totals above add the raw amounts without converting; use the per-campaign table for exact figures.</p>}
        <Card className="mt-6"><h2 className="mb-3 font-semibold">By campaign</h2><Table rows={e.by_campaign} first="name" label="Campaign" /></Card>
        <Card className="mt-6"><h2 className="mb-3 font-semibold">By platform</h2>{e.by_platform.length ? <Table rows={e.by_platform} first="platform" label="Platform" /> : <p className="text-sm text-muted">No submissions yet.</p>}</Card>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold">Record a payment you received</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Campaign"><Select value={pay.campaign_id} onChange={(ev) => setPay({ ...pay, campaign_id: Number(ev.target.value) || "", submission_id: "" })}><option value="">Choose</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="For submission (optional)"><Select value={pay.submission_id} onChange={(ev) => setPay({ ...pay, submission_id: Number(ev.target.value) || "" })}><option value="">Whole campaign</option>
                {subs.filter((s) => s.campaign_id === pay.campaign_id).map((s) => <option key={s.id} value={s.id}>#{s.id} {s.clip_title ?? ""} ({s.platform})</option>)}</Select></Field>
              <Field label="Amount"><NumberInput min={0} step={0.01} value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} /></Field>
              <Field label="Payment date"><Input type="date" value={pay.received_at} onChange={(ev) => setPay({ ...pay, received_at: ev.target.value })} /></Field>
              <Field label="Note" className="col-span-2"><Input value={pay.note} onChange={(ev) => setPay({ ...pay, note: ev.target.value })} /></Field>
            </div>
            <Button className="mt-4" variant="primary" disabled={!pay.campaign_id || !pay.amount || pay.amount <= 0} onClick={addPayment}>Record payment</Button>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Import from CSV</h2>
            <div className="flex gap-2">
              <Select className="!w-56" value={csvKind} aria-label="What the CSV contains" onChange={(ev) => setCsvKind(ev.target.value as typeof csvKind)}><option value="payments">Payments received</option><option value="metrics">View counts</option></Select>
              <Button onClick={() => csv.current?.click()}><Upload className="size-4" />Choose CSV file</Button>
              <input ref={csv} type="file" accept=".csv,text/csv" className="hidden" onChange={(ev) => { importCsv(ev.target.files?.[0]); ev.target.value = ""; }} />
            </div>
            <p className="mt-3 text-xs text-muted">First line must be the column names.</p>
            <pre className="mt-1 overflow-x-auto rounded bg-base p-2 text-[11px] text-muted">{csvKind === "payments" ? "campaign_id,amount,date,note,submission_id\n1,45.50,2026-03-01,March payout," : "submission_id,views,kind,date,note\n1,12000,self_reported,2026-03-01,\n1,9000,verified,2026-03-05,"}</pre>
            <p className="mt-1 text-xs text-muted">IDs: {csvKind === "payments" ? campaigns.map((c) => `${c.id} = ${c.name}`).join(", ") : subs.map((s) => `${s.id} = ${s.clip_title ?? s.platform}`).join(", ") || "record a submission first"}</p>
            {importErrors.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-bad">{importErrors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </Card>
        </div>
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold">Payments received</h2>
          {!e.payments.length ? <p className="text-sm text-muted">No payments recorded.</p> : (
            <ul className="divide-y divide-line">{e.payments.map((p: any) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm"><span className="w-28 shrink-0 text-xs text-muted">{fmtDate(p.received_at).split(",").slice(0, 2).join(",")}</span>
                <span className="flex-1 truncate">{p.campaign_name}{p.note && <span className="text-muted"> · {p.note}</span>}</span>
                <span className="tabular-nums text-good">{money(p.amount, p.currency)}</span>
                <button aria-label="Delete payment" className="text-muted hover:text-bad" onClick={() => confirm("Delete this payment record?") && del(`/api/payments/${p.id}`).then(reload)}><Trash2 className="size-4" /></button></li>))}
            </ul>
          )}
        </Card>
      </>}
    </>
  );
}
