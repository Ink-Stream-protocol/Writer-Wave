import { useEffect, useMemo, useState } from "react";
import { PAY_SYMBOL } from "../../lib/config";
import { inkEnabled, inkError, isOwned, listNovels, type Novel } from "../../lib/ink";
import type { WalletCtx } from "../Screens";
import { Icon } from "../Icon";
import { Notice } from "../ui";
import { Cover, NotDeployed, PriceChips } from "./common";

export function useNovels() {
  const [novels, setNovels] = useState<Novel[] | null>(null);
  const [error, setError] = useState("");
  const load = () => listNovels().then((n) => { setNovels(n); setError(""); }).catch((e) => { setError(inkError(String(e?.message ?? e))); setNovels([]); });
  useEffect(() => { if (inkEnabled()) load(); }, []);
  return { novels, error, reload: load };
}

export function Bookstore({ ctx }: { ctx: WalletCtx }) {
  const { novels, error } = useNovels();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "popular" | "cheap">("new");
  const shown = useMemo(() => {
    const list = (novels ?? []).filter((n) => !q || `${n.title} ${n.description}`.toLowerCase().includes(q.toLowerCase()));
    if (sort === "popular") return [...list].sort((a, b) => b.secondsRead + b.sales * 3600 - (a.secondsRead + a.sales * 3600));
    if (sort === "cheap") return [...list].sort((a, b) => Number(a.rate - b.rate));
    return list;
  }, [novels, q, sort]);

  if (!inkEnabled()) return <NotDeployed what="The bookstore" />;

  return (
    <div className="stack">
      <div className="store-hero">
        <div>
          <h2>Reading is streaming.</h2>
          <p className="muted">Pay authors by the second while you read — or own the book forever. Stream the full price and it's yours automatically.</p>
        </div>
        <button className="btn btn-primary" onClick={() => ctx.go("Studio")}><Icon name="plus" size={16} /> Publish a novel</button>
      </div>
      <div className="row">
        <input className="input grow" placeholder="Search novels…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg" style={{ minWidth: 260 }}>
          {(["new", "popular", "cheap"] as const).map((s) => <button key={s} className={sort === s ? "on" : ""} onClick={() => setSort(s)}>{s === "new" ? "Newest" : s === "popular" ? "Popular" : `Cheapest/h`}</button>)}
        </div>
      </div>
      <Notice kind="error">{error}</Notice>
      {novels === null ? <p className="muted">Loading novels…</p> : !shown.length ? (
        <div className="card empty">{q ? "No novels match your search." : <>No novels yet — be the first to <button className="link" onClick={() => ctx.go("Studio")}>publish one</button>.</>}</div>
      ) : (
        <div className="book-grid">
          {shown.map((n) => (
            <button key={n.id} className="book" onClick={() => ctx.openNovel(n.id)}>
              <Cover novel={n} />
              <div className="book-meta">
                <b>{n.title}</b>
                <small className="muted">{n.chapters} chapter{n.chapters === 1 ? "" : "s"} · {Math.round(n.secondsRead / 3600)} h read · {n.sales} sold</small>
                <PriceChips novel={n} />
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="muted small" style={{ textAlign: "center" }}>Prices in {PAY_SYMBOL}. Every purchase, stream and chapter earns Writer's Wave points.</p>
    </div>
  );
}

export function Library({ ctx }: { ctx: WalletCtx }) {
  const { novels } = useNovels();
  const [owned, setOwned] = useState<Set<number> | null>(null);
  const me = ctx.signer.publicKey;
  useEffect(() => {
    if (!novels) return;
    Promise.all(novels.map((n) => isOwned(me, n.id).then((o) => (o ? n.id : 0)).catch(() => 0)))
      .then((ids) => setOwned(new Set(ids.filter(Boolean))));
  }, [novels, me]);
  if (!inkEnabled()) return <NotDeployed what="Your library" />;
  const mine = (novels ?? []).filter((n) => owned?.has(n.id) && n.author !== me);
  const written = (novels ?? []).filter((n) => n.author === me);
  return (
    <div className="stack">
      <div className="card">
        <h2>Owned</h2>
        {owned === null ? <p className="muted">Loading…</p> : !mine.length ? <p className="empty">Books you buy or stream to own show up here.</p> : (
          <div className="book-grid">{mine.map((n) => <button key={n.id} className="book" onClick={() => ctx.openNovel(n.id)}><Cover novel={n} /><div className="book-meta"><b>{n.title}</b><small className="muted">{n.chapters} chapters</small></div></button>)}</div>
        )}
      </div>
      {written.length > 0 && (
        <div className="card">
          <h2>Written by you</h2>
          <div className="book-grid">{written.map((n) => <button key={n.id} className="book" onClick={() => ctx.openNovel(n.id)}><Cover novel={n} /><div className="book-meta"><b>{n.title}</b><small className="muted">{n.chapters} chapters</small></div></button>)}</div>
        </div>
      )}
    </div>
  );
}
