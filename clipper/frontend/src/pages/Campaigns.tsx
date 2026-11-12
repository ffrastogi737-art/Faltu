import { ExternalLink, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, NumberInput, PageHeader, Select, Spinner, Textarea, useLoad } from "../components/ui";
import { del, fmtDate, get, money, post, put, type Campaign, type Clip, type Rule, type Submission } from "../services/api";
import { useApp } from "../stores/app";
import { Checklist } from "./Editor";

const BLANK: Omit<Campaign, "id"> = {
  name: "", brand: "", description: "", source_reference: "", url: "", allowed_platforms: [], min_duration: null, max_duration: null, deadline: null,
  payment_model: "per_1000_views", rate_per_1000: 0, flat_rate: 0, max_payout: null, currency: "USD", notes: "", status: "active", rules: [],
};
const RULE_LABEL = { hashtag: "Required hashtag", caption: "Required caption text", branding: "Branding requirement", rule: "Other rule" };
const safeUrl = (u: string) => /^https?:\/\//i.test(u);

function CampaignForm({ initial, onClose, onSaved }: { initial: Partial<Campaign>; onClose: () => void; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const [c, setC] = useState<Omit<Campaign, "id">>({ ...BLANK, ...initial });
  const [platforms, setPlatforms] = useState((initial.allowed_platforms || []).join(", "));
  const [rule, setRule] = useState<Rule>({ kind: "hashtag", value: "" });
  const set = (p: Partial<Campaign>) => setC({ ...c, ...p });
  const save = () => {
    const body = { ...c, allowed_platforms: platforms.split(",").map((s) => s.trim()).filter(Boolean), deadline: c.deadline || null };
    (initial.id ? put(`/api/campaigns/${initial.id}`, body) : post("/api/campaigns", body)).then(() => { onSaved(); onClose(); }).catch((e) => toast(e.message, "error"));
  };
  return (
    <Modal title={initial.id ? "Edit campaign" : "New campaign"} onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Campaign name"><Input value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Brand"><Input value={c.brand} onChange={(e) => set({ brand: e.target.value })} /></Field>
        <Field label="Description" className="md:col-span-2"><Textarea rows={2} value={c.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Campaign link"><Input value={c.url} placeholder="https://" onChange={(e) => set({ url: e.target.value })} /></Field>
        <Field label="Original video / source reference" hint="A link or a note about where the authorised source file is"><Input value={c.source_reference} onChange={(e) => set({ source_reference: e.target.value })} /></Field>
        <Field label="Allowed platforms" hint="Comma separated, e.g. TikTok, Instagram, YouTube"><Input value={platforms} onChange={(e) => setPlatforms(e.target.value)} /></Field>
        <Field label="Submission deadline"><Input type="datetime-local" value={c.deadline ? c.deadline.slice(0, 16) : ""} onChange={(e) => set({ deadline: e.target.value || null })} /></Field>
        <Field label="Minimum clip length (s)"><NumberInput min={0} value={c.min_duration} onChange={(v) => set({ min_duration: v })} /></Field>
        <Field label="Maximum clip length (s)"><NumberInput min={1} value={c.max_duration} onChange={(v) => set({ max_duration: v })} /></Field>
        <Field label="Payment model"><Select value={c.payment_model} onChange={(e) => set({ payment_model: e.target.value as Campaign["payment_model"] })}>
          <option value="per_1000_views">Rate per 1,000 verified views</option><option value="flat_per_clip">Flat amount per clip</option><option value="none">Unpaid / not tracked</option>
        </Select></Field>
        <Field label="Currency"><Input value={c.currency} maxLength={8} onChange={(e) => set({ currency: e.target.value })} /></Field>
        {c.payment_model === "per_1000_views" && <Field label="Rate per 1,000 views"><NumberInput min={0} step={0.01} value={c.rate_per_1000} onChange={(v) => set({ rate_per_1000: v ?? 0 })} /></Field>}
        {c.payment_model === "flat_per_clip" && <Field label="Amount per clip"><NumberInput min={0} step={0.01} value={c.flat_rate} onChange={(v) => set({ flat_rate: v ?? 0 })} /></Field>}
        {c.payment_model !== "none" && <Field label="Maximum payout (optional)"><NumberInput min={0} step={0.01} value={c.max_payout} onChange={(v) => set({ max_payout: v })} /></Field>}
        <Field label="Status"><Select value={c.status} onChange={(e) => set({ status: e.target.value as Campaign["status"] })}><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></Select></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea rows={2} value={c.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 text-sm font-medium">Requirements and rules</div>
        <p className="mb-3 text-xs text-muted">Hashtags and caption text are checked automatically against a submission's caption. Branding and other rules cannot be checked by software, so you confirm those yourself.</p>
        <ul className="mb-3 grid gap-1.5">
          {c.rules.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-sm"><Badge tone="muted">{RULE_LABEL[r.kind]}</Badge><span className="flex-1 break-words">{r.value}</span>
              <button aria-label="Remove rule" className="text-muted hover:text-bad" onClick={() => set({ rules: c.rules.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button></li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Select className="!w-52" value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value as Rule["kind"] })}>
            {Object.entries(RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input value={rule.value} placeholder={rule.kind === "hashtag" ? "#brand" : "Describe the requirement"} onChange={(e) => setRule({ ...rule, value: e.target.value })} />
          <Button disabled={!rule.value.trim()} onClick={() => { set({ rules: [...c.rules, { kind: rule.kind, value: rule.value.trim() }] }); setRule({ ...rule, value: "" }); }}><Plus className="size-4" />Add</Button>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!c.name.trim()} onClick={save}>Save campaign</Button></div>
    </Modal>
  );
}

function SubmissionForm({ campaign, initial, clips, onClose, onSaved }: { campaign: Campaign; initial?: Submission; clips: Clip[]; onClose: () => void; onSaved: () => void }) {
  const toast = useApp((s) => s.toast);
  const [s, setS] = useState({
    clip_id: initial?.clip_id ?? clips.find((c) => c.campaign_id === campaign.id)?.id ?? null, platform: initial?.platform ?? campaign.allowed_platforms[0] ?? "",
    post_url: initial?.post_url ?? "", caption: initial?.caption ?? "", status: initial?.status ?? "pending", notes: initial?.notes ?? "",
  });
  const save = () => {
    const body = { ...s, campaign_id: campaign.id, manual_checks: initial?.manual_checks ?? {} };
    (initial ? put(`/api/submissions/${initial.id}`, body) : post("/api/submissions", body)).then(() => { onSaved(); onClose(); }).catch((e) => toast(e.message, "error"));
  };
  return (
    <Modal title={initial ? "Edit submission" : `Record a submission to ${campaign.name}`} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Clip"><Select value={s.clip_id ?? ""} onChange={(e) => setS({ ...s, clip_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">No clip attached</option>{clips.map((c) => <option key={c.id} value={c.id}>{c.title} ({Math.round(c.end - c.start)}s)</option>)}
        </Select></Field>
        <Field label="Platform"><Input list="platforms" value={s.platform} onChange={(e) => setS({ ...s, platform: e.target.value })} /><datalist id="platforms">{["TikTok", "Instagram", "YouTube", "Facebook", "X", ...campaign.allowed_platforms].map((p) => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Post link"><Input value={s.post_url} placeholder="https://" onChange={(e) => setS({ ...s, post_url: e.target.value })} /></Field>
        <Field label="Caption you posted" hint="Used to check required hashtags and caption text"><Textarea rows={3} value={s.caption} onChange={(e) => setS({ ...s, caption: e.target.value })} /></Field>
        <Field label="Status" hint="Set approved or rejected only when the campaign has actually told you so."><Select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value as Submission["status"] })}>
          <option value="pending">Pending (not submitted yet)</option><option value="submitted">Submitted, awaiting review</option><option value="approved">Approved by the campaign</option><option value="rejected">Rejected by the campaign</option>
        </Select></Field>
        <Field label="Notes"><Textarea rows={2} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!s.platform.trim()} onClick={save}>Save</Button></div>
    </Modal>
  );
}

function SubmissionRow({ s, onChange, onEdit }: { s: Submission; onChange: () => void; onEdit: () => void }) {
  const toast = useApp((st) => st.toast);
  const [views, setViews] = useState<number | null>(null);
  const [kind, setKind] = useState("self_reported");
  const fail = (e: Error) => toast(e.message, "error");
  const confirmRule = (ruleId: number, done: boolean) =>
    put(`/api/submissions/${s.id}`, { campaign_id: s.campaign_id, clip_id: s.clip_id, platform: s.platform, post_url: s.post_url, caption: s.caption, status: s.status, notes: s.notes,
      manual_checks: { ...s.manual_checks, [ruleId]: done } }).then(onChange).catch(fail);
  return (
    <div className="rounded-lg border border-line bg-panel2/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{s.clip_title ?? "No clip attached"}</span><Badge tone="muted">{s.platform}</Badge><Badge>{s.status}</Badge>
        {safeUrl(s.post_url) && <a href={s.post_url} target="_blank" rel="noreferrer noopener" className="text-xs text-accent hover:underline">View post <ExternalLink className="inline size-3" /></a>}
        <span className="ml-auto flex gap-1"><Button small variant="ghost" onClick={onEdit}><Pencil className="size-3.5" /></Button>
          <Button small variant="ghost" onClick={() => confirm("Delete this submission and its view records?") && del(`/api/submissions/${s.id}`).then(onChange).catch(fail)}><Trash2 className="size-3.5" /></Button></span>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div><div className="mb-1.5 text-xs font-medium text-muted">Requirement checklist</div>
          {s.checklist.length ? <Checklist items={s.checklist} onConfirm={confirmRule} /> : <p className="text-xs text-muted">No requirements set for this campaign.</p>}</div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">Views (entered by you)</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><div className="tabular-nums">{s.self_reported_views.toLocaleString()}</div><div className="text-[11px] text-muted">Self-reported</div></div>
            <div><div className="tabular-nums">{s.verified_views.toLocaleString()}</div><div className="text-[11px] text-muted">Verified</div></div>
            <div><div className="tabular-nums">{money(s.estimated, s.currency)}</div><div className="text-[11px] text-muted">Estimate{s.estimate_basis !== "none" && ` (from ${s.estimate_basis.replace("_", "-")} views)`}</div></div>
          </div>
          <div className="mt-3 flex gap-2">
            <NumberInput className="!w-28" min={0} placeholder="Views" aria-label="View count" value={views} onChange={setViews} />
            <Select className="!w-36" aria-label="Kind of view count" value={kind} onChange={(e) => setKind(e.target.value)}><option value="self_reported">Self-reported</option><option value="verified">Verified</option></Select>
            <Button small disabled={views === null || views < 0} onClick={() => post(`/api/submissions/${s.id}/metrics`, { views: Math.round(views!), kind }).then(() => { setViews(null); onChange(); }).catch(fail)}>Record</Button>
          </div>
          {s.metrics.length > 0 && <ul className="mt-2 text-[11px] text-muted">{s.metrics.slice(-4).map((m) => (
            <li key={m.id} className="flex justify-between"><span>{fmtDate(m.recorded_at)} · {m.kind.replace("_", "-")}</span>
              <span>{m.views.toLocaleString()} <button aria-label="Delete this record" className="hover:text-bad" onClick={() => del(`/api/metrics/${m.id}`).then(onChange).catch(fail)}>×</button></span></li>))}</ul>}
        </div>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const toast = useApp((s) => s.toast);
  const [campaigns, reloadC, error] = useLoad(() => get<Campaign[]>("/api/campaigns"));
  const [subs, reloadS] = useLoad(() => get<Submission[]>("/api/submissions"));
  const [clips] = useLoad(() => get<Clip[]>("/api/clips"));
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [subFor, setSubFor] = useState<{ campaign: Campaign; initial?: Submission } | null>(null);
  if (error) return <ErrorBox text={error} />;
  if (!campaigns || !subs || !clips) return <Spinner />;
  return (
    <>
      <PageHeader title="Campaigns" subtitle="Your own record of clipping campaigns. Nothing here talks to a campaign platform; approvals and view counts are what you enter."
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus className="size-4" />New campaign</Button>} />
      {!campaigns.length ? <Empty icon={<Megaphone className="size-8" />} title="No campaigns yet" text="Add a campaign to keep its rules, deadline and pay rate in one place, and check your clips against it." action={<Button variant="primary" onClick={() => setEditing({})}>Add a campaign</Button>} /> : (
        <div className="grid gap-5">
          {campaigns.map((c) => {
            const mine = subs.filter((s) => s.campaign_id === c.id);
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 text-lg font-semibold">{c.name}<Badge>{c.status}</Badge></h2>
                    <p className="text-sm text-muted">{[c.brand, c.description].filter(Boolean).join(" · ")}</p>
                  </div>
                  {safeUrl(c.url) && <a href={c.url} target="_blank" rel="noreferrer noopener"><Button small><ExternalLink className="size-3.5" />Campaign page</Button></a>}
                  <Button small onClick={() => setEditing(c)}><Pencil className="size-3.5" />Edit</Button>
                  <Button small variant="danger" onClick={() => confirm(`Delete "${c.name}" with its submissions, view records and payments?`) && del(`/api/campaigns/${c.id}`).then(() => { reloadC(); reloadS(); }).catch((e) => toast(e.message, "error"))}><Trash2 className="size-3.5" /></Button>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
                  <div><dt className="text-xs text-muted">Pay</dt><dd>{c.payment_model === "per_1000_views" ? `${money(c.rate_per_1000, c.currency)} / 1,000 views` : c.payment_model === "flat_per_clip" ? `${money(c.flat_rate, c.currency)} per clip` : "Not tracked"}{c.max_payout !== null && c.payment_model !== "none" && `, max ${money(c.max_payout, c.currency)}`}</dd></div>
                  <div><dt className="text-xs text-muted">Clip length</dt><dd>{c.min_duration ?? 0}s – {c.max_duration !== null ? `${c.max_duration}s` : "any"}</dd></div>
                  <div><dt className="text-xs text-muted">Platforms</dt><dd>{c.allowed_platforms.join(", ") || "Any"}</dd></div>
                  <div><dt className="text-xs text-muted">Deadline</dt><dd>{c.deadline ? fmtDate(c.deadline) : "None"}</dd></div>
                </dl>
                {c.rules.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{c.rules.map((r) => <span key={r.id} className="rounded-md bg-panel2 px-2 py-1 text-xs"><span className="text-muted">{RULE_LABEL[r.kind]}: </span>{r.value}</span>)}</div>}
                {(c.source_reference || c.notes) && <p className="mt-3 whitespace-pre-wrap text-xs text-muted">{[c.source_reference && `Source: ${c.source_reference}`, c.notes].filter(Boolean).join("\n")}</p>}
                <div className="mt-4 border-t border-line pt-4">
                  <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Submissions ({mine.length})</h3><Button small onClick={() => setSubFor({ campaign: c })}><Plus className="size-3.5" />Record submission</Button></div>
                  {!mine.length ? <p className="text-sm text-muted">Nothing submitted yet.</p> : <div className="grid gap-3">{mine.map((s) => <SubmissionRow key={s.id} s={s} onChange={reloadS} onEdit={() => setSubFor({ campaign: c, initial: s })} />)}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <CampaignForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { reloadC(); reloadS(); }} />}
      {subFor && <SubmissionForm {...subFor} clips={clips} onClose={() => setSubFor(null)} onSaved={reloadS} />}
    </>
  );
}
