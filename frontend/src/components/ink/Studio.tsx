import { useState } from "react";
import { PAY_SYMBOL } from "../../lib/config";
import { addChapter, amt, hours, inkEnabled, inkError, perHour, publishNovel, updatePricing, type Novel } from "../../lib/ink";
import { fromStroops } from "../../lib/soroban";
import type { WalletCtx } from "../Screens";
import { Icon } from "../Icon";
import { Card, Field, Notice, useAction } from "../ui";
import { useNovels } from "./Bookstore";
import { Cover, NotDeployed, txLink } from "./common";

export function Studio({ ctx }: { ctx: WalletCtx }) {
  const { novels, reload } = useNovels();
  const me = ctx.signer.publicKey;
  const mine = (novels ?? []).filter((n) => n.author === me);
  const [selected, setSelected] = useState<number | null>(null);
  if (!inkEnabled()) return <NotDeployed what="Author Studio" />;
  const current = mine.find((n) => n.id === selected) ?? mine[0];
  const totals = mine.reduce((t, n) => ({ earned: t.earned + n.earned, secs: t.secs + n.secondsRead, sales: t.sales + n.sales }), { earned: 0n, secs: 0, sales: 0 });

  return (
    <div className="stack">
      {mine.length > 0 && (
        <div className="balance-card">
          <span className="muted small">Lifetime earnings</span>
          <div className="big">{amt(totals.earned)} <span className="muted" style={{ fontSize: "1rem" }}>{PAY_SYMBOL}</span></div>
          <div className="muted">{hours(totals.secs)} read · {totals.sales} copies sold · {mine.length} novel{mine.length > 1 ? "s" : ""}</div>
        </div>
      )}
      <div className="cols" style={{ marginTop: 0 }}>
        <PublishForm ctx={ctx} onDone={async (id) => { await reload(); setSelected(id); }} />
        {current ? <ChapterForm ctx={ctx} novels={mine} current={current} onSelect={setSelected} onDone={reload} /> : (
          <Card title="Write chapters">
            <p className="muted">Publish a novel first, then add chapters here. Each chapter (one per novel per day) earns <b>100 Writer's Wave points</b>, and keeping a weekly streak earns bonus points.</p>
          </Card>
        )}
      </div>
      {mine.length > 0 && (
        <Card title="Your novels">
          <ul className="list">
            {mine.map((n) => (
              <li key={n.id}>
                <Cover novel={n} size="sm" />
                <div className="grow">
                  <b>{n.title}</b>
                  <div className="muted small">{n.chapters} chapters · {hours(n.secondsRead)} read · {n.sales} sold · own {amt(n.price)} / stream {perHour(n.rate)} {PAY_SYMBOL}/h</div>
                </div>
                <span className="amount in">+{amt(n.earned)} {PAY_SYMBOL}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => ctx.openNovel(n.id)}>Open</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {current && <PricingForm ctx={ctx} novel={current} onDone={reload} />}
    </div>
  );
}

function PublishForm({ ctx, onDone }: { ctx: WalletCtx; onDone: (id: number) => void }) {
  const [f, setF] = useState({ title: "", description: "", coverUri: "", price: "20", ratePerHour: "1", royaltyPct: 10, freeChapters: 1 });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: ["royaltyPct", "freeChapters"].includes(k) ? Number(e.target.value) : e.target.value });
  const go = () => a.run(async () => {
    try {
      const r = await publishNovel(ctx.signer, f);
      setF({ ...f, title: "", description: "", coverUri: "" });
      onDone(r.id);
      return r;
    } catch (e) { throw new Error(inkError(String((e as Error)?.message ?? e))); }
  }, (r) => <>Published! {txLink(r.hash)}</>);
  return (
    <Card title={<><Icon name="plus" size={16} /> Publish a novel</>}>
      <Field label="Title"><input value={f.title} maxLength={120} onChange={set("title")} placeholder="The Rust Chronicles" /></Field>
      <Field label="Description"><textarea className="input" rows={3} maxLength={1000} value={f.description} onChange={set("description")} placeholder="What's it about?" /></Field>
      <Field label="Cover image URL (optional, https)"><input value={f.coverUri} onChange={set("coverUri")} placeholder="https://…/cover.jpg" /></Field>
      <div className="grid2">
        <Field label={`Buy-forever price (${PAY_SYMBOL})`}><input inputMode="decimal" value={f.price} onChange={set("price")} /></Field>
        <Field label={`Streaming price (${PAY_SYMBOL} per hour)`}><input inputMode="decimal" value={f.ratePerHour} onChange={set("ratePerHour")} /></Field>
      </div>
      <div className="grid2">
        <Field label="Resale royalty %"><input type="number" min={0} max={50} value={f.royaltyPct} onChange={set("royaltyPct")} /></Field>
        <Field label="Free chapters"><input type="number" min={0} max={20} value={f.freeChapters} onChange={set("freeChapters")} /></Field>
      </div>
      <Notice kind="error">{a.error}</Notice>
      <Notice kind="ok">{a.ok}</Notice>
      <button className="btn btn-primary btn-block" disabled={a.busy || !f.title || !ctx.state?.exists} onClick={go}>{a.busy ? (ctx.signer.kind === "external" ? "Confirm in your wallet…" : "Publishing…") : "Publish"}</button>
    </Card>
  );
}

function ChapterForm({ ctx, novels, current, onSelect, onDone }: { ctx: WalletCtx; novels: Novel[]; current: Novel; onSelect: (id: number) => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const a = useAction();
  const bytes = new TextEncoder().encode(body).length;
  const go = () => a.run(async () => {
    try {
      const r = await addChapter(ctx.signer, current.id, title, body);
      setTitle(""); setBody("");
      await onDone();
      return r;
    } catch (e) { throw new Error(inkError(String((e as Error)?.message ?? e))); }
  }, (r) => <>Chapter published — Wave points earned (max once a day per novel). {txLink(r.hash)}</>);
  return (
    <Card title={<><Icon name="send" size={16} /> Add a chapter</>}>
      <Field label="Novel">
        <select value={current.id} onChange={(e) => onSelect(Number(e.target.value))}>{novels.map((n) => <option key={n.id} value={n.id}>{n.title} ({n.chapters} chapters)</option>)}</select>
      </Field>
      <Field label={`Chapter ${current.chapters + 1} title`}><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Text" hint={<span style={{ color: bytes > 16000 ? "var(--err)" : undefined }}>{bytes.toLocaleString()} / 16,000 bytes · blank line = new paragraph · stored on-chain (public)</span>}>
        <textarea className="input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Notice kind="error">{a.error}</Notice>
      <Notice kind="ok">{a.ok}</Notice>
      <button className="btn btn-primary btn-block" disabled={a.busy || !title || !body || bytes > 16000} onClick={go}>{a.busy ? (ctx.signer.kind === "external" ? "Confirm in your wallet…" : "Publishing…") : "Publish chapter"}</button>
    </Card>
  );
}

function PricingForm({ ctx, novel, onDone }: { ctx: WalletCtx; novel: Novel; onDone: () => void }) {
  const [price, setPrice] = useState(fromStroops(novel.price));
  const [rate, setRate] = useState(fromStroops(novel.rate * 3600n));
  const [royalty, setRoyalty] = useState(novel.royaltyBps / 100);
  const [free, setFree] = useState(novel.freeChapters);
  const a = useAction();
  return (
    <Card title={`Pricing — ${novel.title}`}>
      <div className="grid2">
        <Field label={`Buy price (${PAY_SYMBOL})`}><input value={price} onChange={(e) => setPrice(e.target.value.trim())} /></Field>
        <Field label={`Stream price (${PAY_SYMBOL}/h)`}><input value={rate} onChange={(e) => setRate(e.target.value.trim())} /></Field>
      </div>
      <div className="grid2">
        <Field label="Resale royalty %"><input type="number" min={0} max={50} value={royalty} onChange={(e) => setRoyalty(Number(e.target.value))} /></Field>
        <Field label="Free chapters"><input type="number" min={0} value={free} onChange={(e) => setFree(Number(e.target.value))} /></Field>
      </div>
      <Notice kind="error">{a.error}</Notice>
      <Notice kind="ok">{a.ok}</Notice>
      <button className="btn btn-ghost" disabled={a.busy} onClick={() => a.run(async () => {
        try { const r = await updatePricing(ctx.signer, novel.id, price, rate, royalty, free); await onDone(); return r; }
        catch (e) { throw new Error(inkError(String((e as Error)?.message ?? e))); }
      }, (r) => <>Pricing updated. {txLink(r.hash)}</>)}>Save pricing</button>
    </Card>
  );
}
