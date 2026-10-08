import { useCallback, useEffect, useState } from "react";
import { PAY_SYMBOL } from "../../lib/config";
import {
  amt, buyNovel, buyResale, cancelResale, getChapter, getListings, getNovel, hours, inkError, isOwned, listResale, perHour,
  startStream, stopStream, streamStatus, type Chapter, type Listing, type Novel, type StreamStatus,
} from "../../lib/ink";
import { fromStroops } from "../../lib/soroban";
import type { WalletCtx } from "../Screens";
import { Icon } from "../Icon";
import { Card, Field, Notice, short, useAction } from "../ui";
import { Cover, PriceChips, txLink } from "./common";

const DEPOSITS = [
  { label: "15 min", secs: 900 },
  { label: "1 hour", secs: 3600 },
  { label: "3 hours", secs: 10800 },
];

/** Live stream meter: interpolates between on-chain reads every second. */
function useLiveStream(me: string, novel: Novel | null) {
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [, tick] = useState(0);
  const refresh = useCallback(async () => {
    if (!novel) return;
    try { setStatus(await streamStatus(me, novel.id)); setFetchedAt(Date.now()); } catch { /* ignore */ }
  }, [me, novel]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 15_000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!status || !novel || !status.active) return { status, live: null, refresh };
  const extra = BigInt(Math.floor((Date.now() - fetchedAt) / 1000));
  const extraPaid = [novel.rate * extra, status.depositLeft, status.toOwn].reduce((a, b) => (a < b ? a : b));
  const secs = status.sessionSeconds + Number(novel.rate > 0n ? extraPaid / novel.rate : 0n);
  return {
    status, refresh,
    live: { paid: status.paid + extraPaid, left: status.depositLeft - extraPaid, toOwn: status.toOwn - extraPaid, secs },
  };
}

export function NovelPage({ ctx, id }: { ctx: WalletCtx; id: number }) {
  const me = ctx.signer.publicKey;
  const [novel, setNovel] = useState<Novel | null>(null);
  const [owned, setOwned] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [reading, setReading] = useState<number | null>(null);
  const [depositSecs, setDepositSecs] = useState(3600);
  const [resalePrice, setResalePrice] = useState("");
  const a = useAction();
  const { status, live, refresh: refreshStream } = useLiveStream(me, novel);
  const busyText = ctx.signer.kind === "external" ? "Confirm in your wallet…" : "Working…";

  const load = useCallback(async () => {
    try {
      const [n, o, l] = await Promise.all([getNovel(id), isOwned(me, id), getListings(id)]);
      setNovel(n); setOwned(o); setListings(l); setLoadErr("");
    } catch (e) { setLoadErr(inkError(String((e as Error)?.message ?? e))); }
  }, [id, me]);
  useEffect(() => { load(); }, [load]);

  const after = async () => { await Promise.all([load(), refreshStream(), ctx.refresh()]); };
  const run = <T,>(fn: () => Promise<T & { hash: string }>, msg: string) =>
    a.run(async () => { try { const r = await fn(); await after(); return r; } catch (e) { throw new Error(inkError(String((e as Error)?.message ?? e))); } }, (r) => <>{msg} {txLink(r.hash)}</>);

  if (loadErr) return <Notice kind="error">{loadErr}</Notice>;
  if (!novel) return <p className="muted">Loading…</p>;

  const isAuthor = novel.author === me;
  const streaming = !!status?.active;
  const credit = status?.paid ?? 0n;
  const buyCost = novel.price - credit > 0n ? novel.price - credit : 0n;
  const canRead = (i: number) => owned || isAuthor || streaming || i < novel.freeChapters;
  const myListing = listings.find((l) => l.seller === me);
  const deposit = fromStroops(novel.rate * BigInt(depositSecs) < buyCost || buyCost === 0n ? novel.rate * BigInt(depositSecs) : buyCost);

  if (reading !== null) {
    return <Reader ctx={ctx} novel={novel} index={reading} canRead={canRead} onNav={setReading} onClose={() => setReading(null)} live={live} onStop={() => run(() => stopStream(ctx.signer, novel.id), "Stream stopped, unused deposit refunded.")} busy={a.busy} />;
  }

  return (
    <div className="stack">
      <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => ctx.go("Store")}>← Bookstore</button>
      <div className="novel-head">
        <Cover novel={novel} size="lg" />
        <div className="stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: "1.8rem", letterSpacing: "-.02em" }}>{novel.title}</h2>
          <div className="muted small">by <span className="mono">{short(novel.author, 6)}</span>{isAuthor && <span className="pill" style={{ marginLeft: 8 }}>You</span>}</div>
          <p>{novel.description || <span className="muted">No description.</span>}</p>
          <PriceChips novel={novel} />
          <div className="stats">
            <div><b>{novel.chapters}</b><small>chapters</small></div>
            <div><b>{hours(novel.secondsRead)}</b><small>read</small></div>
            <div><b>{novel.sales}</b><small>owners</small></div>
            <div><b>{novel.royaltyBps / 100}%</b><small>resale royalty</small></div>
          </div>
        </div>
      </div>

      <Notice kind="error">{a.error}</Notice>
      <Notice kind="ok">{a.ok}</Notice>

      {!isAuthor && !owned && (
        <div className="cols" style={{ marginTop: 0 }}>
          <Card title={<><Icon name="key" size={16} /> Buy forever</>}>
            <p className="muted small">One payment, straight to the author. Yours permanently on-chain{credit > 0n ? " — what you've already streamed is credited" : ""}.</p>
            <div className="big-num">{amt(buyCost)} <small>{PAY_SYMBOL}</small></div>
            {credit > 0n && <small className="muted">{amt(novel.price)} − {amt(credit)} already streamed</small>}
            <button className="btn btn-primary btn-block" disabled={a.busy || !ctx.state?.exists} onClick={() => run(() => buyNovel(ctx.signer, novel.id), "You own this novel!")}>{a.busy ? busyText : `Buy for ${amt(buyCost)} ${PAY_SYMBOL}`}</button>
          </Card>
          <Card title={<><Icon name="activity" size={16} /> Stream to read</>}>
            {!streaming ? (
              <>
                <p className="muted small">Pay {perHour(novel.rate)} {PAY_SYMBOL}/hour, by the second. Stop any time and the rest comes back. Stream {amt(novel.price)} {PAY_SYMBOL} in total and you own it.</p>
                <Field label="Deposit">
                  <div className="seg">{DEPOSITS.map((d) => <button key={d.secs} className={depositSecs === d.secs ? "on" : ""} onClick={() => setDepositSecs(d.secs)}>{d.label}</button>)}</div>
                </Field>
                <small className="muted">Deposit: {deposit} {PAY_SYMBOL} (refundable)</small>
                <button className="btn btn-primary btn-block" disabled={a.busy || !ctx.state?.exists} onClick={() => run(() => startStream(ctx.signer, novel.id, deposit), "Streaming! Enjoy the book.")}>{a.busy ? busyText : "Start streaming"}</button>
              </>
            ) : (
              <StreamMeter live={live} onRead={() => setReading(0)} onStop={() => run(() => stopStream(ctx.signer, novel.id), "Stream stopped, unused deposit refunded.")} busy={a.busy} />
            )}
          </Card>
        </div>
      )}

      {(owned || isAuthor) && !isAuthor && (
        <Card title="Resell your copy">
          <p className="muted small">List your copy for another reader. The author automatically gets {novel.royaltyBps / 100}% of the sale.</p>
          {myListing ? (
            <div className="between"><span>Listed for <b>{amt(myListing.price)} {PAY_SYMBOL}</b></span><button className="btn btn-ghost btn-sm" disabled={a.busy} onClick={() => run(() => cancelResale(ctx.signer, novel.id), "Listing removed.")}>Cancel listing</button></div>
          ) : (
            <div className="row"><input className="input" inputMode="decimal" placeholder={`Price in ${PAY_SYMBOL}`} value={resalePrice} onChange={(e) => setResalePrice(e.target.value.trim())} /><button className="btn btn-primary btn-sm" disabled={a.busy || !resalePrice} onClick={() => run(() => listResale(ctx.signer, novel.id, resalePrice), "Listed for resale.")}>List</button></div>
          )}
        </Card>
      )}

      {!owned && !isAuthor && listings.length > 0 && (
        <Card title="Second-hand copies">
          <ul className="list">
            {listings.map((l) => (
              <li key={l.seller}>
                <span className="coin">2nd</span>
                <div className="grow">From <span className="mono">{short(l.seller, 4)}</span><div className="muted small">Author gets {amt((l.price * BigInt(novel.royaltyBps)) / 10000n)} {PAY_SYMBOL} royalty</div></div>
                <span className="amount">{amt(l.price)} {PAY_SYMBOL}</span>
                <button className="btn btn-primary btn-sm" disabled={a.busy} onClick={() => run(() => buyResale(ctx.signer, novel.id, l.seller), "You bought a second-hand copy!")}>Buy</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Chapters" actions={isAuthor ? <button className="btn btn-ghost btn-sm" onClick={() => ctx.go("Studio")}>Add chapter</button> : undefined}>
        {!novel.chapters ? <p className="empty">No chapters yet.</p> : (
          <ul className="list">
            {Array.from({ length: novel.chapters }, (_, i) => (
              <li key={i}>
                <span className="coin">{i + 1}</span>
                <div className="grow">Chapter {i + 1} {i < novel.freeChapters && <span className="pill">Free</span>}</div>
                {canRead(i) ? <button className="btn btn-ghost btn-sm" onClick={() => setReading(i)}>Read</button> : <span className="muted small"><Icon name="lock" size={14} /> Buy or stream</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StreamMeter({ live, onRead, onStop, busy }: { live: { paid: bigint; left: bigint; toOwn: bigint; secs: number } | null; onRead: () => void; onStop: () => void; busy: boolean }) {
  if (!live) return <p className="muted">Loading stream…</p>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="meter">
        <span className="dot pulse" /> Streaming
        <div className="big-num">{amt(live.paid, 7)} <small>{PAY_SYMBOL} paid</small></div>
        <small className="muted">{hours(live.secs)} this session · {amt(live.left)} {PAY_SYMBOL} deposit left · {amt(live.toOwn)} {PAY_SYMBOL} to own</small>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={onRead}>Read</button>
        <button className="btn btn-ghost" disabled={busy} onClick={onStop}>Stop & refund the rest</button>
      </div>
    </div>
  );
}

function Reader({ ctx, novel, index, canRead, onNav, onClose, live, onStop, busy }: {
  ctx: WalletCtx; novel: Novel; index: number; canRead: (i: number) => boolean; onNav: (i: number) => void; onClose: () => void;
  live: { paid: bigint; left: bigint; toOwn: bigint; secs: number } | null; onStop: () => void; busy: boolean;
}) {
  const [ch, setCh] = useState<Chapter | null>(null);
  const [err, setErr] = useState("");
  const allowed = canRead(index);
  useEffect(() => {
    setCh(null); setErr("");
    if (!allowed) return;
    getChapter(novel.id, index).then(setCh).catch((e) => setErr(inkError(String(e?.message ?? e))));
    window.scrollTo(0, 0);
  }, [novel.id, index, allowed]);
  void ctx;
  return (
    <div className="reader">
      <div className="reader-bar">
        <button className="link" onClick={onClose}>← {novel.title}</button>
        {live && <span className="pill"><span className="dot pulse" /> {amt(live.paid, 5)} {PAY_SYMBOL} · {hours(live.secs)}</span>}
        {live && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onStop}>Stop stream</button>}
      </div>
      {!allowed ? <div className="card empty">This chapter is locked. Buy the book or start streaming to read on.</div>
        : err ? <Notice kind="error">{err}</Notice>
        : !ch ? <p className="muted">Loading chapter…</p> : (
          <article>
            <small className="muted">Chapter {index + 1}</small>
            <h1>{ch.title}</h1>
            {ch.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </article>
        )}
      <div className="between" style={{ marginTop: 24 }}>
        <button className="btn btn-ghost" disabled={index === 0} onClick={() => onNav(index - 1)}>← Previous</button>
        <button className="btn btn-ghost" disabled={index >= novel.chapters - 1} onClick={() => onNav(index + 1)}>Next →</button>
      </div>
    </div>
  );
}
