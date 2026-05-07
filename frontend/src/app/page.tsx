import Link from "next/link";

// Static placeholder novels — replace with on-chain fetch in a future issue
const NOVELS = [
  {
    title: "The Rust Chronicles",
    author: "GAUTHORADDRESS1",
    coverUrl: "https://placehold.co/200x300/1e293b/94a3b8?text=Rust+Chronicles",
    priceFull: "20 XLM",
    dripRate: "0.0001 USDC/s",
  },
  {
    title: "Stellar Horizons",
    author: "GAUTHORADDRESS2",
    coverUrl: "https://placehold.co/200x300/1e293b/94a3b8?text=Stellar+Horizons",
    priceFull: "15 XLM",
    dripRate: "0.00008 USDC/s",
  },
];

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-indigo-400">✍️ InkStream</h1>
        <p className="text-gray-400 mt-2">
          Buy forever or stream by the second. Reading is streaming.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {NOVELS.map((novel) => (
          <Link
            key={novel.title}
            href={`/novel/${encodeURIComponent(novel.title)}`}
            className="bg-gray-900 rounded-2xl overflow-hidden hover:ring-2 hover:ring-indigo-500 transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={novel.coverUrl} alt={novel.title} className="w-full" />
            <div className="p-4">
              <h2 className="font-semibold text-lg">{novel.title}</h2>
              <p className="text-gray-500 text-sm truncate">{novel.author}</p>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="bg-indigo-900 text-indigo-300 px-2 py-1 rounded-full">
                  Buy {novel.priceFull}
                </span>
                <span className="bg-teal-900 text-teal-300 px-2 py-1 rounded-full">
                  Stream {novel.dripRate}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
