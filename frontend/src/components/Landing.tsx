import { useEffect, useState } from "react";
import { BRAND, NETWORK, PAY_SYMBOL, WALLET_NAME } from "../lib/config";
import { inkEnabled, listNovels, type Novel } from "../lib/ink";
import { Icon, Logo } from "./Icon";
import { Cover, PriceChips } from "./ink/common";

const TICKER = [
  ["⏱", "Pay by the second"], ["∞", "Own forever"], ["↺", "Resell with royalties"], ["🌊", "Writer's Wave"],
  ["RS", "Soroban smart contracts"], ["QR", "Scan to pay"], ["5s", "Settlement"], ["$", "Fees under a cent"],
];

const FEATURES = [
  { icon: "activity", title: "Stream to read", body: "Open any novel and pay the author per second while you read — stop any time and the rest of your deposit comes straight back. No $20 barrier." },
  { icon: "key", title: "Stream-to-own", body: "Every second you stream counts toward the book's price. Reach it and the book is yours — buying later only costs the difference." },
  { icon: "trend", title: "The Writer's Wave", body: "Recurring Writing Sprints. Authors earn points for new chapters and weekly streaks, readers for hours read. At the end, the reward pool is split by points." },
  { icon: "swap", title: "Resell, author still earns", body: "Done with a book? List your copy. Whoever buys it pays you — and the author's royalty is enforced by the smart contract." },
  { icon: "wallet", title: `${WALLET_NAME} wallet built in`, body: "Create a wallet in seconds or connect Freighter, xBull, Albedo, LOBSTR and more. Send, receive, scan to pay and convert — all in one app." },
  { icon: "shield", title: "No middlemen", body: "Payments go straight from reader to author on Stellar. Open-source Rust contracts on Soroban; nobody can freeze or skim your earnings." },
];

const STEPS = [
  { t: "Connect", d: `Create a ${WALLET_NAME} wallet or connect the one you use.` },
  { t: "Read", d: "Start streaming any novel, or buy it forever." },
  { t: "Write", d: "Publish chapters and get paid every second you're read." },
  { t: "Earn", d: "Collect Wave points and claim your share of each sprint's pool." },
];

const FAQ = [
  { q: "How much does streaming cost?", a: "Each author sets an hourly price — often well under a dollar an hour. You put down a small refundable deposit; you only pay for the seconds you actually read." },
  { q: "What is the Writer's Wave?", a: "Inspired by the Drips Wave model: every few weeks there's a Writing Sprint with a reward pool funded by the ecosystem. Authors, readers and open-source contributors earn points; when the sprint ends, everyone claims a share proportional to their points — automatically, on-chain." },
  { q: "Do I need crypto experience?", a: `No. Create a ${WALLET_NAME} wallet in the app, ${NETWORK.name === "testnet" ? "get free test funds with one click" : "add funds"}, and start reading. You can also cash in and out through Stellar anchors.` },
  { q: "Who holds my money?", a: "You do. The app is non-custodial, and streaming deposits are held by an open-source smart contract that can only pay the author for time read or refund you." },
  { q: "Is this real money?", a: NETWORK.name === "testnet" ? "This deployment runs on the Stellar testnet — everything is free test funds, so try anything." : "Yes, this deployment uses Stellar mainnet." },
];

export function Landing({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const [featured, setFeatured] = useState<Novel[]>([]);
  useEffect(() => { if (inkEnabled()) listNovels(0, 6).then(setFeatured).catch(() => {}); }, []);

  return (
    <div className="landing">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand"><Logo /> {BRAND}</div>
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#wave">Writer's Wave</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <button className="btn btn-primary" onClick={onStart}>Start reading</button>
        </div>
      </header>

      <section className="section hero">
        <div className="grid-bg" />
        <div style={{ position: "relative" }}>
          <span className="pill"><span className="dot" /> The streaming bookstore on Stellar{NETWORK.name === "testnet" ? " · Testnet" : ""}</span>
          <h1>Reading is <span className="hl">streaming.</span></h1>
          <p className="lead">Pay authors by the second while you read, or own the book forever. Writers get paid instantly and earn more every Writing Sprint — all with one wallet.</p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={onStart}>Start reading <Icon name="arrow" size={16} /></button>
            <button className="btn btn-ghost" onClick={onStart}><Icon name="pen" size={16} /> Publish your novel</button>
          </div>
          <div className="hero-badges">
            <span><Icon name="activity" size={16} /> ~$0.36 an hour</span>
            <span><Icon name="key" size={16} /> Stream-to-own</span>
            <span><Icon name="trend" size={16} /> Earn Wave points</span>
          </div>
        </div>
        <div className="mock" aria-hidden>
          <div className="phone">
            <div className="between small"><b>{BRAND}</b><span className="dot" /></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="cover" style={{ width: 70, background: "linear-gradient(150deg,#8b5cf6,#2b1660)" }}><div className="cover-text"><span className="cover-title" style={{ fontSize: ".6rem" }}>The Rust Chronicles</span></div></div>
              <div className="small"><b>The Rust Chronicles</b><div className="muted">Chapter 7</div></div>
            </div>
            <div className="meter"><span className="small"><span className="dot pulse" /> Streaming</span><b style={{ fontSize: "1.3rem" }}>0.0412 {PAY_SYMBOL}</b><small className="muted">14 min · 62% to own</small></div>
            <div className="small muted">Writer's Wave</div>
            <div className="between small"><span>Your points</span><b style={{ color: "var(--accent2)" }}>1,250</b></div>
            <div className="between small"><span>Est. share</span><b>48.2 {PAY_SYMBOL}</b></div>
          </div>
          <div className="float f1"><small className="muted">Author earned</small><b>+3.60 {PAY_SYMBOL}</b><small style={{ color: "var(--ok)" }}>✓ paid per second</small></div>
          <div className="float f2"><small className="muted">Chapter published</small><b style={{ color: "var(--accent2)" }}>+150 pts</b><small className="muted">week 2 streak</small></div>
          <div className="float f3"><b style={{ fontSize: ".95rem" }}>📖 You own this book</b><small className="muted">streamed the full price</small></div>
        </div>
      </section>

      <div className="ticker" aria-hidden>
        <div className="ticker-track">
          {[...TICKER, ...TICKER].map(([c, n], i) => <div className="ticker-item" key={i}><span className="coin">{c}</span>{n}</div>)}
        </div>
      </div>

      {featured.length > 0 && (
        <section className="section" style={{ paddingBottom: 0 }}>
          <div className="section-title"><h2>On the shelves</h2></div>
          <div className="book-grid">
            {featured.map((n) => (
              <button key={n.id} className="book" onClick={onStart}><Cover novel={n} /><div className="book-meta"><b>{n.title}</b><PriceChips novel={n} /></div></button>
            ))}
          </div>
        </section>
      )}

      <section className="section" id="features">
        <div className="section-title">
          <h2>Removes the $20 barrier</h2>
          <p>Most readers won't pay upfront for a book they might not finish. So don't make them.</p>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}><div className="ico"><Icon name={f.icon} /></div><h3>{f.title}</h3><p>{f.body}</p></div>
          ))}
        </div>
      </section>

      <section className="section" id="wave">
        <div className="cta" style={{ textAlign: "left", display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div>
            <span className="pill"><Icon name="trend" size={12} /> The Writer's Wave</span>
            <h2 style={{ marginTop: 14 }}>Write consistently. Get rewarded.</h2>
            <p style={{ margin: "14px 0 0" }}>Recurring Writing Sprints with a shared reward pool. Points are recorded by the smart contracts the moment you earn them — no spreadsheets, no trust required.</p>
          </div>
          <ul className="list">
            <li><span className="coin">+100</span><div className="grow">Publish a chapter <div className="muted small">once per novel per day</div></div></li>
            <li><span className="coin">+50×</span><div className="grow">Keep a weekly streak <div className="muted small">bonus grows every week</div></div></li>
            <li><span className="coin">+50</span><div className="grow">Read for an hour / sell a copy</div></li>
            <li><span className="coin">PR</span><div className="grow">Contribute to InkStream <div className="muted small">100–1000 pts per merged issue</div></div></li>
          </ul>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-title"><h2>One app. Four steps.</h2></div>
        <div className="steps">
          {STEPS.map((s, i) => <div className="step" key={s.t}><div className="n">{i + 1}</div><h3>{s.t}</h3><p>{s.d}</p></div>)}
        </div>
      </section>

      <section className="section" id="faq">
        <div className="section-title"><h2>Questions, answered</h2></div>
        <div className="faq">{FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </section>

      <section className="section">
        <div className="cta">
          <h2>Your next favourite book is a second away.</h2>
          <p>Create a wallet, grab free test funds and start reading — or publish your first chapter today.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={onStart}>Get started <Icon name="arrow" size={16} /></button>
            <button className="btn btn-ghost" onClick={onDemo}>How it works</button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="brand"><Logo size={24} /> {BRAND}</div>
          <span>Open-source streaming bookstore · Soroban (Stellar) · {WALLET_NAME} wallet</span>
          <span>MIT · © {new Date().getFullYear()} {BRAND}</span>
        </div>
      </footer>
    </div>
  );
}
