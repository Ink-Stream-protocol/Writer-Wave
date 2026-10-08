import { useEffect, useState } from "react";
import { NETWORK, PAY_SYMBOL } from "../../lib/config";
import { amt, perHour, type Novel } from "../../lib/ink";
import { Icon } from "../Icon";
import { short } from "../ui";

export const txLink = (hash: string) => (
  <a href={`${NETWORK.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>
);

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Cover({ novel, size = "md" }: { novel: Pick<Novel, "title" | "coverUri" | "author">; size?: "sm" | "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const h = hue(novel.title + novel.author);
  const ok = /^https:\/\//.test(novel.coverUri) && !broken;
  return (
    <div className={`cover cover-${size}`} style={ok ? undefined : { background: `linear-gradient(150deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 70% 22%))` }}>
      {ok ? <img src={novel.coverUri} alt="" onError={() => setBroken(true)} /> : (
        <div className="cover-text">
          <span className="cover-title">{novel.title}</span>
          <span className="cover-author">{short(novel.author, 4)}</span>
        </div>
      )}
    </div>
  );
}

export function PriceChips({ novel }: { novel: Novel }) {
  return (
    <div className="row">
      <span className="chip chip-buy"><Icon name="key" size={12} /> Own {amt(novel.price)} {PAY_SYMBOL}</span>
      <span className="chip chip-stream"><Icon name="activity" size={12} /> Stream {perHour(novel.rate)} {PAY_SYMBOL}/h</span>
    </div>
  );
}

/** Seconds countdown text like "3d 4h" / "12m". */
export function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor(to - now));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return <>{d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`}</>;
}

export function NotDeployed({ what }: { what: string }) {
  return (
    <div className="center-wrap">
      <div className="card">
        <h2>{what} isn't connected yet</h2>
        <p className="muted">The InkStream contracts need to be deployed once. From the repo root run:</p>
        <pre className="code">./scripts/deploy.sh</pre>
        <p className="muted small">It builds the Rust contracts, deploys them to {NETWORK.name}, starts the first Writing Sprint and writes the contract IDs into <code>frontend/.env</code>. Then restart the app.</p>
      </div>
    </div>
  );
}
