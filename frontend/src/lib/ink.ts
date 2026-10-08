// Client for the InkStream contract (contracts/ink_stream, Rust).
import { INK_CONTRACT_ID, NETWORK } from "./config";
import type { Signer } from "./signer";
import { friendlyError, fromStroops, invokeContract, readContract, sv, toStroops } from "./soroban";

export const inkEnabled = () => !!INK_CONTRACT_ID && !!NETWORK.sorobanRpcUrl;

export const INK_ERRORS: Record<number, string> = {
  1: "Novel not found",
  2: "Chapter not found",
  3: "Only the author can do that",
  4: "Price must be greater than zero",
  5: "Streaming rate must be above zero and no more than the price",
  6: "Royalty can be at most 50%",
  7: "Text is too long",
  8: "You already own this novel",
  9: "You don't own a copy to sell",
  10: "Amount must be greater than zero",
  11: "No active stream",
  12: "Buyer and seller must be different",
  13: "That copy isn't listed for sale",
  14: "Too many listings for this novel",
};
export const inkError = (m: string) => friendlyError(m, INK_ERRORS);

export interface Novel {
  id: number;
  author: string;
  title: string;
  description: string;
  coverUri: string;
  price: bigint;
  rate: bigint;
  royaltyBps: number;
  chapters: number;
  freeChapters: number;
  createdAt: number;
  sales: number;
  secondsRead: number;
  earned: bigint;
}

export interface Chapter { title: string; body: string; publishedAt: number }
export interface Listing { seller: string; price: bigint }
export interface StreamStatus {
  active: boolean;
  depositLeft: bigint;
  owedNow: bigint;
  sessionSeconds: number;
  paid: bigint;
  secondsLeft: number;
  toOwn: bigint;
}

type Raw = Record<string, unknown>;
const big = (v: unknown) => BigInt((v as bigint | number | string | undefined) ?? 0);

export function decodeNovel(v: unknown): Novel {
  const o = v as Raw;
  return {
    id: Number(o.id), author: String(o.author), title: String(o.title), description: String(o.description ?? ""),
    coverUri: String(o.cover_uri ?? ""), price: big(o.price), rate: big(o.rate), royaltyBps: Number(o.royalty_bps),
    chapters: Number(o.chapters), freeChapters: Number(o.free_chapters), createdAt: Number(o.created_at),
    sales: Number(o.sales), secondsRead: Number(o.seconds_read), earned: big(o.earned),
  };
}

export function decodeStream(v: unknown): StreamStatus {
  const o = v as Raw;
  return {
    active: Boolean(o.active), depositLeft: big(o.deposit_left), owedNow: big(o.owed_now), sessionSeconds: Number(o.session_seconds),
    paid: big(o.paid), secondsLeft: Number(o.seconds_left), toOwn: big(o.to_own),
  };
}

const read = <T,>(fn: string, args: Parameters<typeof readContract>[2], source?: string) =>
  readContract<T>(INK_CONTRACT_ID, fn, args, { source, errors: INK_ERRORS });
const write = <T,>(signer: Signer, fn: string, args: Parameters<typeof invokeContract>[3]) =>
  invokeContract<T>(signer, INK_CONTRACT_ID, fn, args, INK_ERRORS);

// ── reads ────────────────────────────────────────────────────────────────────
export const listNovels = async (before = 0, limit = 50) => ((await read<unknown[]>("list_novels", [sv.u32(before), sv.u32(limit)])) ?? []).map(decodeNovel);
export const getNovel = async (id: number) => decodeNovel(await read("novel", [sv.u32(id)]));
export const getChapter = async (id: number, index: number): Promise<Chapter> => {
  const o = (await read<Raw>("chapter", [sv.u32(id), sv.u32(index)]));
  return { title: String(o.title), body: String(o.body), publishedAt: Number(o.published_at) };
};
export const isOwned = (reader: string, id: number) => read<boolean>("is_owned", [sv.address(reader), sv.u32(id)], reader);
export const streamStatus = async (reader: string, id: number) => decodeStream(await read("stream_status", [sv.address(reader), sv.u32(id)], reader));
export const getListings = async (id: number): Promise<Listing[]> =>
  ((await read<Raw[]>("listings", [sv.u32(id)])) ?? []).map((l) => ({ seller: String(l.seller), price: big(l.price) }));

// ── writes ───────────────────────────────────────────────────────────────────
export interface PublishInput { title: string; description: string; coverUri: string; price: string; ratePerHour: string; royaltyPct: number; freeChapters: number }

/** Converts a per-hour price into the contract's per-second rate (base units), rounding down, min 1. */
export function hourlyToRate(perHour: string): bigint {
  const r = toStroops(perHour) / 3600n;
  return r > 0n ? r : 1n;
}

export function publishArgs(author: string, p: PublishInput) {
  if (p.royaltyPct < 0 || p.royaltyPct > 50) throw new Error("Royalty must be between 0% and 50%");
  return [
    sv.address(author), sv.str(p.title.trim()), sv.str(p.description.trim()), sv.str(p.coverUri.trim()),
    sv.i128(toStroops(p.price)), sv.i128(hourlyToRate(p.ratePerHour)), sv.u32(Math.round(p.royaltyPct * 100)), sv.u32(p.freeChapters),
  ];
}

export const publishNovel = async (signer: Signer, p: PublishInput) => {
  if (!p.title.trim()) throw new Error("Give your novel a title");
  const r = await write<number>(signer, "publish", publishArgs(signer.publicKey, p));
  return { hash: r.hash, id: Number(r.value) };
};
export const addChapter = (signer: Signer, id: number, title: string, body: string) => {
  if (!title.trim() || !body.trim()) throw new Error("Chapter needs a title and some text");
  if (new TextEncoder().encode(body).length > 16_000) throw new Error("Chapter is over 16,000 bytes — split it into two");
  return write<number>(signer, "add_chapter", [sv.u32(id), sv.str(title.trim()), sv.str(body)]);
};
export const updatePricing = (signer: Signer, id: number, price: string, ratePerHour: string, royaltyPct: number, freeChapters: number) =>
  write(signer, "update_pricing", [sv.u32(id), sv.i128(toStroops(price)), sv.i128(hourlyToRate(ratePerHour)), sv.u32(Math.round(royaltyPct * 100)), sv.u32(freeChapters)]);
export const buyNovel = (signer: Signer, id: number) => write<bigint>(signer, "buy", [sv.address(signer.publicKey), sv.u32(id)]);
export const startStream = (signer: Signer, id: number, deposit: string) => write(signer, "start_stream", [sv.address(signer.publicKey), sv.u32(id), sv.i128(toStroops(deposit))]);
export const stopStream = (signer: Signer, id: number) => write<bigint>(signer, "stop_stream", [sv.address(signer.publicKey), sv.u32(id)]);
export const listResale = (signer: Signer, id: number, price: string) => write(signer, "list_resale", [sv.address(signer.publicKey), sv.u32(id), sv.i128(toStroops(price))]);
export const cancelResale = (signer: Signer, id: number) => write(signer, "cancel_resale", [sv.address(signer.publicKey), sv.u32(id)]);
export const buyResale = (signer: Signer, id: number, seller: string) => write<bigint>(signer, "buy_resale", [sv.address(signer.publicKey), sv.u32(id), sv.address(seller)]);

// ── formatting ───────────────────────────────────────────────────────────────
export const amt = (v: bigint, dp = 4) => {
  const s = fromStroops(v);
  const [w, f = ""] = s.split(".");
  return f ? `${Number(w).toLocaleString()}.${f.slice(0, dp)}`.replace(/\.?0+$/, "") : Number(w).toLocaleString();
};
export const perHour = (rate: bigint) => ((Number(rate) * 3600) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 3 });
export const hours = (secs: number) => (secs >= 3600 ? `${(secs / 3600).toFixed(1)} h` : `${Math.floor(secs / 60)} min`);
