import { FormEvent, ReactNode, useEffect, useState } from "react";

type Row = Record<string, any>;
type Report = Row & { rankings: Record<string, { rule: string; items: Row[] }>; setups: Row[]; stocks: Row[]; warnings: string[] };

const pct = (x: number | null | undefined, signed = false) =>
  x == null ? "–" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(signed ? 2 : 0)}%`;
const num = (x: number | null | undefined, d = 2) => (x == null ? "–" : x.toFixed(d));
const tone = (x: number | null | undefined) => (x == null || x === 0 ? "" : x > 0 ? "up" : "down");
const dirTone: Row = { BUY: "up", SELL: "down", WAIT: "muted" };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = localStorage.getItem("apiKey") ?? "";
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", "X-API-Key": key } });
  if (r.status === 401) {
    const k = prompt("API key for watchlist changes");
    if (k) { localStorage.setItem("apiKey", k); return api(path, init); }
  }
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="scroll">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={head[j]}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const LISTS: [string, string][] = [
  ["bullish", "A. Top bullish"], ["bearish", "B. Top bearish"], ["breakout", "C. Breakout candidates"],
  ["breakdown", "D. Breakdown candidates"], ["momentum", "E. Momentum"], ["long_term", "F. Long-term fundamental"],
  ["avoid", "G. Stocks to avoid"],
];

function Overview({ rep }: { rep: Report }) {
  const r = rep.regime;
  return (
    <>
      <div className="card">
        <h3>Market regime: {r.label}{r.high_volatility ? " (high volatility)" : ""}</h3>
        <div className="muted">
          Benchmark close {num(r.close)} · 50-day avg {num(r.sma50)} · 200-day avg {num(r.sma200)} · scanned {rep.stocks.length} stocks,
          skipped {rep.skipped.length} · probabilities come from {rep.calibration.samples.toLocaleString()} finished past predictions
        </div>
      </div>
      <h2>Global markets</h2>
      <Table empty="No global market data collected yet." head={["Market", "Last", "Change", "Date", "Source"]}
        rows={(rep.macro as Row[]).map((m) => [m.name, num(m.last), <span className={tone(m.change)}>{pct(m.change, true)}</span>,
          m.stale ? <span className="tag down">stale {m.date ?? "no data"}</span> : m.date, m.source ?? "–"])} />
      <h2>FII / DII activity (₹ crore)</h2>
      <Table empty="No FII/DII data: the NSE connector is off (ENABLE_NSE_API) or returned nothing." head={["Date", "Category", "Buy", "Sell", "Net", "Source"]}
        rows={(rep.flows as Row[]).map((f) => [f.date, f.category, num(f.buy), num(f.sell), <span className={tone(f.net)}>{num(f.net)}</span>, f.source])} />
      <h2>Upcoming events</h2>
      <Table empty="No events loaded (data/events.csv)." head={["Date", "Type", "Symbol", "Event", "Source"]}
        rows={(rep.events as Row[]).map((e) => [e.date, e.type, e.symbol, e.url ? <a href={e.url}>{e.title}</a> : e.title, e.source])} />
      <h2>Data problems this run</h2>
      {rep.failures.length + rep.skipped.length === 0 ? <p className="muted">None.</p> : (
        <ul>
          {(rep.failures as string[]).map((f) => <li key={f}>{f}</li>)}
          {(rep.skipped as Row[]).slice(0, 30).map((s) => <li key={s.symbol}>{s.symbol}: {s.reason}</li>)}
        </ul>
      )}
    </>
  );
}

function Rankings({ rep }: { rep: Report }) {
  return (
    <>
      {LISTS.map(([k, title]) => (
        <section key={k}>
          <h2>{title}</h2>
          <div className="muted">Rule: {rep.rankings[k].rule}</div>
          <Table empty="No stock met this rule. Nothing is added just to fill the list."
            head={["#", "Symbol", "Sector", "Price", "Call", "P(up)", "P(down)", "Confidence", "Risk", "Rel. volume", "F&O"]}
            rows={rep.rankings[k].items.map((s, i) => [i + 1, <b>{s.symbol}</b>, s.sector ?? "–", num(s.price),
              <span className={dirTone[s.direction]}>{s.direction}</span>, pct(s.p_bull), pct(s.p_bear), s.confidence, s.risk,
              s.rvol == null ? "–" : `${num(s.rvol, 1)}x`, s.fno ? "yes" : "no"])} />
        </section>
      ))}
    </>
  );
}

function Setups({ rep }: { rep: Report }) {
  return (
    <>
      <p className="muted">
        Positional: listed below. Delivery: {rep.strategies.delivery}. Intraday: {rep.strategies.intraday}.
      </p>
      {rep.setups.length === 0 && <p className="muted">No setup cleared the probability thresholds on {rep.as_of}.</p>}
      {rep.setups.map((s) => (
        <div className="card" key={s.symbol}>
          <h3><span className={`tag ${dirTone[s.direction]}`}>{s.direction}</span> {s.name} ({s.symbol})</h3>
          <div className="muted">Last verified close {num(s.price)} on {s.price_date} · positional · {s.holding_period} · risk {s.risk}</div>
          <Table empty="" head={["Entry zone", "Target 1", "Target 2", "Stop loss", "Risk:Reward", "P(up)", "P(down)", "P(flat)", "Past cases"]}
            rows={[[`${s.entry_low} – ${s.entry_high}`, s.target1, s.target2, s.stop, `1:${s.rr1} / 1:${s.rr2}`, pct(s.p_bull), pct(s.p_bear), pct(s.p_neutral), s.samples]]} />
          <ul>
            <li>In the middle half of similar past cases the stock itself moved {pct(s.expected_return_range[0], true)} to {pct(s.expected_return_range[1], true)}</li>
            <li>Technical: {s.technical_reasoning.join("; ")}</li>
            <li>Fundamental: {s.fundamental_reasoning}</li>
            <li>News: {s.news}</li>
            <li>Risks: {s.risks.join("; ")}</li>
            <li>Invalid if: {s.invalidation.join("; ")}</li>
            {s.short_selling_note && <li>{s.short_selling_note}{s.fno ? "" : " This stock is not flagged as F&O."}</li>}
          </ul>
        </div>
      ))}
    </>
  );
}

function News({ rep }: { rep: Report }) {
  return (
    <Table empty="No recent news. Set NEWS_FEEDS to RSS feeds you are allowed to use." head={["Published (IST)", "Sentiment", "Headline", "Stocks", "Source"]}
      rows={(rep.news as Row[]).map((n) => [n.published_at.replace("T", " ").slice(0, 16),
        <span className={n.sentiment === "positive" ? "up" : n.sentiment === "negative" ? "down" : "muted"}>{n.sentiment}</span>,
        <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>, n.symbols || "–", n.source])} />
  );
}

function Performance() {
  const [perf, setPerf] = useState<Row | null>(null);
  const [preds, setPreds] = useState<Row[]>([]);
  useEffect(() => { api<Row>("/api/performance").then(setPerf); api<Row[]>("/api/predictions?limit=300").then(setPreds); }, []);
  if (!perf) return <p className="muted">Loading…</p>;
  const calls = preds.filter((p) => p.direction !== "WAIT");
  return (
    <>
      <p className="muted">
        {perf.predictions} predictions recorded, {perf.resolved} scored, {perf.pending} still inside their holding period.
        Recorded predictions cannot be edited or deleted.
      </p>
      {perf.trades > 0 ? (
        <>
          <Table empty="" head={["Closed calls", "Win rate", "Avg return", "Profit factor", "Total", "NIFTY same periods", "Max drawdown", "Sharpe", "Brier", "BUY wins", "SELL wins"]}
            rows={[[perf.trades, pct(perf.win_rate), pct(perf.avg_return, true), num(perf.profit_factor), pct(perf.total_return, true),
              pct(perf.benchmark_return, true), pct(perf.max_drawdown, true), num(perf.sharpe), num(perf.brier, 3), pct(perf.bullish_accuracy), pct(perf.bearish_accuracy)]]} />
          <h2>By sector</h2>
          <Table empty="" head={["Sector", "Calls", "Win rate", "Avg return"]}
            rows={Object.entries(perf.by_sector as Record<string, Row>).map(([k, v]) => [k, v.trades, pct(v.win_rate), pct(v.avg_return, true)])} />
        </>
      ) : <p className="muted">No call has finished its holding period yet, so there is no performance to show.</p>}
      <h2>Recent BUY / SELL calls</h2>
      <Table empty="No BUY or SELL calls recorded yet." head={["Date", "Symbol", "Call", "P(up)", "P(down)", "Ref. price", "Target", "Stop", "Result", "Return", "Best", "Worst"]}
        rows={calls.map((p) => [p.as_of, p.symbol, <span className={dirTone[p.direction]}>{p.direction}</span>, pct(p.p_bull), pct(p.p_bear),
          num(p.entry_ref), num(p.target1), num(p.stop), p.outcome ?? "open", <span className={tone(p.ret)}>{pct(p.ret, true)}</span>, pct(p.mfe, true), pct(p.mae, true)])} />
    </>
  );
}

function Watchlist({ rep }: { rep: Report | null }) {
  const [items, setItems] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api<Row[]>("/api/watchlist").then(setItems); api<Row[]>("/api/notifications").then(setAlerts); }, []);
  const by = Object.fromEntries((rep?.stocks ?? []).map((s) => [s.symbol, s]));
  const change = (p: Promise<Row[]>) => p.then(setItems).then(() => setError("")).catch((e) => setError(String(e.message)));
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    change(api("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol: f.get("symbol"), note: f.get("note") }) }));
    e.currentTarget.reset();
  };
  return (
    <>
      <form onSubmit={add}>
        <input name="symbol" aria-label="Symbol" placeholder="Symbol, e.g. RELIANCE" required maxLength={20} />
        <input name="note" aria-label="Note" placeholder="Note (optional)" maxLength={200} />
        <button className="act">Add to watchlist</button>
      </form>
      {error && <div className="warn" role="alert">{error}</div>}
      <Table empty="Watchlist is empty." head={["Symbol", "Note", "Price", "Call", "P(up)", "P(down)", "Added", ""]}
        rows={items.map((w) => { const s = by[w.symbol]; return [<b>{w.symbol}</b>, w.note, num(s?.price), s ? <span className={dirTone[s.direction]}>{s.direction}</span> : "not in last scan",
          pct(s?.prob?.p_bull), pct(s?.prob?.p_bear), w.added_at.slice(0, 10),
          <button className="act" onClick={() => change(api(`/api/watchlist/${encodeURIComponent(w.symbol)}`, { method: "DELETE" }))}>Remove</button>]; })} />
      <h2>Alerts and notifications</h2>
      <Table empty="No alerts yet." head={["Time (IST)", "Type", "Message", "Telegram"]}
        rows={alerts.map((a) => [a.created_at.replace("T", " ").slice(0, 16), a.kind, <span style={{ whiteSpace: "pre-wrap" }}>{a.text}</span>, a.sent ? "sent" : "not sent"])} />
    </>
  );
}

const TABS = ["Overview", "Rankings", "Trade setups", "News", "Performance", "Watchlist"];

export default function App() {
  const [tab, setTab] = useState(TABS[0]);
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Report>("/api/report/latest").then(setRep).catch((e) => setError(String(e.message))); }, []);
  return (
    <main>
      <h1>Indian Market Intelligence</h1>
      {rep && (
        <div className="muted">
          {rep.kind} report for {rep.as_of} · generated {rep.generated_at.replace("T", " ").slice(0, 16)} IST · sources: {rep.sources.join(", ") || "none"}
        </div>
      )}
      {rep?.stale && <div className="warn" role="alert">Stale: this report is older than the latest completed trading session.</div>}
      {rep?.warnings.map((w) => <div className="warn" key={w}>{w}</div>)}
      {error && <div className="warn" role="alert">No report available yet ({error}). Run the scan job first.</div>}
      <nav role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      {tab === "Performance" ? <Performance /> : tab === "Watchlist" ? <Watchlist rep={rep} /> : !rep ? null
        : tab === "Overview" ? <Overview rep={rep} /> : tab === "Rankings" ? <Rankings rep={rep} />
        : tab === "Trade setups" ? <Setups rep={rep} /> : <News rep={rep} />}
      <p className="muted">{rep?.disclaimer ?? "Research output, not investment advice."}</p>
    </main>
  );
}
