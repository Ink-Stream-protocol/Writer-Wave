import { useCallback, useEffect, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { PAY_SYMBOL } from "../../lib/config";
import { amt } from "../../lib/ink";
import { tokenContractId } from "../../lib/escrow";
import {
  ACTIONS, awardPoints, claimReward, claimable, cycleCount, estShare, fundPool, getAdmin, getCycle, hasClaimed, liveCycle,
  pointValues, pointsOf, setPointValue, standings, startCycle, waveEnabled, waveError, type Cycle, type Standing,
} from "../../lib/wave";
import type { WalletCtx } from "../Screens";
import { Icon } from "../Icon";
import { Card, Field, Notice, short, useAction } from "../ui";
import { Countdown, NotDeployed, txLink } from "./common";

interface PastCycle { cycle: Cycle; points: number; claimable: bigint; claimed: boolean }

export function WavePage({ ctx }: { ctx: WalletCtx }) {
  const me = ctx.signer.publicKey;
  const [live, setLive] = useState<Cycle | null | undefined>(undefined);
  const [myPoints, setMyPoints] = useState(0);
  const [board, setBoard] = useState<Standing[]>([]);
  const [values, setValues] = useState<number[]>([]);
  const [past, setPast] = useState<PastCycle[]>([]);
  const [admin, setAdmin] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [fundAmt, setFundAmt] = useState("");
  const a = useAction();

  const load = useCallback(async () => {
    try {
      const [l, v, count, ad] = await Promise.all([liveCycle(), pointValues(), cycleCount(), getAdmin()]);
      setLive(l); setValues(v); setAdmin(ad);
      if (l) {
        const [p, b] = await Promise.all([pointsOf(l.id, me), standings(l.id)]);
        setMyPoints(p); setBoard(b);
      }
      const ids = Array.from({ length: count }, (_, i) => count - i).filter((id) => id !== l?.id).slice(0, 6);
      const cycles = await Promise.all(ids.map(async (id) => {
        const c = await getCycle(id);
        const [pts, cl, done] = await Promise.all([pointsOf(id, me), claimable(id, me), hasClaimed(id, me)]);
        return { cycle: c, points: pts, claimable: cl, claimed: done };
      }));
      setPast(cycles);
      if (!l && cycles[0]) setBoard(await standings(cycles[0].cycle.id));
      setLoadErr("");
    } catch (e) {
      setLoadErr(waveError(String((e as Error)?.message ?? e)));
      setLive(null);
    }
  }, [me]);
  useEffect(() => { if (waveEnabled()) load(); }, [load]);

  if (!waveEnabled()) return <NotDeployed what="The Writer's Wave" />;
  const run = <T,>(fn: () => Promise<T & { hash: string }>, msg: (r: T) => string) =>
    a.run(async () => { try { const r = await fn(); await Promise.all([load(), ctx.refresh()]); return r; } catch (e) { throw new Error(waveError(String((e as Error)?.message ?? e))); } }, (r) => <>{msg(r)} {txLink(r.hash)}</>);

  const share = live ? estShare(live.pool, myPoints, live.totalPoints) : 0n;
  const rank = board.findIndex((s) => s.user === me) + 1;
  const isAdmin = admin === me;

  return (
    <div className="stack">
      <Notice kind="error">{loadErr}</Notice>
      <div className="wave-hero">
        <div className="stack" style={{ gap: 8 }}>
          <span className="pill" style={{ alignSelf: "flex-start" }}><Icon name="trend" size={12} /> The Writer's Wave</span>
          {live === undefined ? <p className="muted">Loading…</p> : live ? (
            <>
              <h2>{live.name}</h2>
              <div className="muted">Ends in <b style={{ color: "var(--text)" }}><Countdown to={live.end} /></b> · {live.participants} participant{live.participants === 1 ? "" : "s"} · {live.totalPoints.toLocaleString()} points earned</div>
            </>
          ) : <h2>No sprint running right now</h2>}
          <p className="muted small">Earn points by writing, reading and contributing. When the sprint ends, the reward pool is split by points — claim your share right here.</p>
        </div>
        {live && (
          <div className="pool">
            <small className="muted">Reward pool</small>
            <div className="big">{amt(live.pool)} <span style={{ fontSize: "1rem" }}>{PAY_SYMBOL}</span></div>
          </div>
        )}
      </div>

      <Notice kind="error">{a.error}</Notice>
      <Notice kind="ok">{a.ok}</Notice>

      {live && (
        <div className="cols" style={{ marginTop: 0 }}>
          <Card title="Your sprint">
            <div className="stats">
              <div><b>{myPoints.toLocaleString()}</b><small>points</small></div>
              <div><b>{rank ? `#${rank}` : "—"}</b><small>rank</small></div>
              <div><b>{amt(share)}</b><small>{PAY_SYMBOL} est. share</small></div>
              <div><b>{live.totalPoints ? ((myPoints / live.totalPoints) * 100).toFixed(1) : "0"}%</b><small>of pool</small></div>
            </div>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => ctx.go("Studio")}><Icon name="send" size={14} /> Write a chapter</button>
              <button className="btn btn-ghost btn-sm" onClick={() => ctx.go("Store")}><Icon name="activity" size={14} /> Read & earn</button>
            </div>
          </Card>
          <Card title="Grow the pool">
            <p className="muted small">Sponsors, publishers and fans can add to this sprint's reward pool. 100% goes to participants.</p>
            <div className="row">
              <input className="input" inputMode="decimal" placeholder={`Amount in ${PAY_SYMBOL}`} value={fundAmt} onChange={(e) => setFundAmt(e.target.value.trim())} />
              <button className="btn btn-primary btn-sm" disabled={a.busy || !fundAmt} onClick={() => run(() => fundPool(ctx.signer, live.id, fundAmt), () => `Added ${fundAmt} ${PAY_SYMBOL} to the pool — thank you!`)}>Fund</button>
            </div>
          </Card>
        </div>
      )}

      <div className="cols" style={{ marginTop: 0 }}>
        <Card title="How to earn">
          <ul className="list">
            {ACTIONS.map((x, i) => (
              <li key={x.key}>
                <div className="grow"><b>{x.label}</b><div className="muted small">{x.who} · {x.note}</div></div>
                <span className="amount">{x.key === "Contribution" ? "per task" : `+${values[i] ?? "…"}`}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={live ? "Leaderboard" : "Last sprint's leaderboard"}>
          {!board.length ? <p className="empty">No points yet — be the first!</p> : (
            <ol className="list board">
              {board.slice(0, 20).map((s, i) => (
                <li key={s.user} className={s.user === me ? "me" : ""}>
                  <span className={`rank r${i + 1}`}>{i + 1}</span>
                  <span className="grow mono">{s.user === me ? "You" : short(s.user, 6)}</span>
                  <span className="amount">{s.points.toLocaleString()} pts</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {past.length > 0 && (
        <Card title="Past sprints">
          <ul className="list">
            {past.map(({ cycle: c, points, claimable: cl, claimed }) => {
              const ended = Date.now() / 1000 >= c.end;
              return (
                <li key={c.id}>
                  <div className="grow"><b>{c.name}</b><div className="muted small">{new Date(c.start * 1000).toLocaleDateString()} – {new Date(c.end * 1000).toLocaleDateString()} · pool {amt(c.pool)} {PAY_SYMBOL} · you: {points.toLocaleString()} pts</div></div>
                  {claimed ? <span className="pill">Claimed</span>
                    : ended && cl > 0n ? <button className="btn btn-primary btn-sm" disabled={a.busy} onClick={() => run(() => claimReward(ctx.signer, c.id), (v) => `Claimed ${amt(BigInt((v as unknown as { value: bigint }).value ?? cl))} ${PAY_SYMBOL}!`)}>Claim {amt(cl)} {PAY_SYMBOL}</button>
                    : <span className="muted small">{ended ? "Nothing to claim" : "Upcoming"}</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isAdmin && <AdminPanel ctx={ctx} live={live ?? null} values={values} onDone={load} />}
    </div>
  );
}

function AdminPanel({ ctx, live, values, onDone }: { ctx: WalletCtx; live: Cycle | null; values: number[]; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [user, setUser] = useState("");
  const [pts, setPts] = useState("100");
  const [action, setAction] = useState(0);
  const [val, setVal] = useState("");
  const a = useAction();
  const run = (fn: () => Promise<{ hash: string }>, msg: string) =>
    a.run(async () => { try { const r = await fn(); await onDone(); return r; } catch (e) { throw new Error(waveError(String((e as Error)?.message ?? e))); } }, (r) => <>{msg} {txLink(r.hash)}</>);
  return (
    <Card title={<><Icon name="shield" size={16} /> Sprint admin</>}>
      <div className="cols" style={{ marginTop: 0 }}>
        <div className="stack" style={{ gap: 10 }}>
          <b>Start a sprint</b>
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 2 — Summer of Stories" /></Field>
          <Field label="Length">
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>{[1, 2, 4, 6, 8].map((w) => <option key={w} value={w}>{w} week{w > 1 ? "s" : ""}</option>)}</select>
          </Field>
          <button className="btn btn-primary btn-sm" disabled={a.busy || !name || !!live} onClick={() => {
            const start = Math.floor(Date.now() / 1000);
            return run(() => startCycle(ctx.signer, name, start, start + weeks * 7 * 86400, tokenContractId("XLM")), "Sprint started.");
          }}>{live ? "A sprint is already running" : "Start sprint (pool in XLM)"}</button>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <b>Award contribution points</b>
          <Field label="Contributor address"><input value={user} onChange={(e) => setUser(e.target.value)} placeholder="G…" /></Field>
          <Field label="Points (e.g. 100 small · 250 medium · 500 large · 1000 epic)"><input type="number" value={pts} onChange={(e) => setPts(e.target.value)} /></Field>
          <button className="btn btn-primary btn-sm" disabled={a.busy || !live || !StrKey.isValidEd25519PublicKey(user.trim())} onClick={() => run(() => awardPoints(ctx.signer, user.trim(), Number(pts)), `Awarded ${pts} points.`)}>Award</button>
          <b>Point values</b>
          <div className="row">
            <select className="input" style={{ flex: 1 }} value={action} onChange={(e) => setAction(Number(e.target.value))}>{ACTIONS.map((x, i) => <option key={x.key} value={i}>{x.label} ({values[i]})</option>)}</select>
            <input className="input" style={{ width: 90 }} type="number" placeholder="pts" value={val} onChange={(e) => setVal(e.target.value)} />
            <button className="btn btn-ghost btn-sm" disabled={a.busy || !val} onClick={() => run(() => setPointValue(ctx.signer, action, Number(val)), "Point value updated.")}>Set</button>
          </div>
        </div>
      </div>
      <Notice kind="error">{a.error}</Notice>
      <Notice kind="ok">{a.ok}</Notice>
    </Card>
  );
}
