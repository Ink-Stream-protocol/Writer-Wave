import { describe, expect, it } from "vitest";
import { Keypair, xdr, nativeToScVal, scValToNative, Address } from "@stellar/stellar-sdk";
import { amt, decodeNovel, decodeStream, hourlyToRate, inkError, perHour, publishArgs } from "./ink";
import { decodeCycle, estShare, waveError } from "./wave";
import { sv } from "./soroban";

const author = Keypair.random().publicKey();
const type = (v: xdr.ScVal) => String((v as unknown as { type: unknown }).type);
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const map = (entries: [string, xdr.ScVal][]) =>
  xdr.ScVal.scvMap(entries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => new xdr.ScMapEntry({ key: sym(k), val })));

describe("InkStream client", () => {
  it("converts an hourly price into a per-second rate", () => {
    expect(hourlyToRate("1")).toBe(10_000_000n / 3600n); // 2777 stroops/s
    expect(hourlyToRate("0.0000001")).toBe(1n); // never zero
    expect(perHour(2777n)).toBe("1");
  });

  it("encodes publish() args in the contract's order and types", () => {
    const args = publishArgs(author, { title: " Rust ", description: "d", coverUri: "", price: "20", ratePerHour: "1", royaltyPct: 10, freeChapters: 1 });
    expect(args.map(type)).toEqual(["scvAddress", "scvString", "scvString", "scvString", "scvI128", "scvI128", "scvU32", "scvU32"]);
    expect(scValToNative(args[1])).toBe("Rust");
    expect(scValToNative(args[4])).toBe(200_000_000n);
    expect(scValToNative(args[6])).toBe(1000);
    expect(() => publishArgs(author, { title: "x", description: "", coverUri: "", price: "1", ratePerHour: "1", royaltyPct: 60, freeChapters: 0 })).toThrow();
  });

  it("decodes Novel and StreamStatus structs", () => {
    const n = decodeNovel(scValToNative(map([
      ["id", nativeToScVal(3, { type: "u32" })], ["author", new Address(author).toScVal()], ["title", nativeToScVal("T", { type: "string" })],
      ["description", nativeToScVal("", { type: "string" })], ["cover_uri", nativeToScVal("", { type: "string" })],
      ["price", nativeToScVal(200_000_000n, { type: "i128" })], ["rate", nativeToScVal(2777n, { type: "i128" })], ["royalty_bps", nativeToScVal(1000, { type: "u32" })],
      ["chapters", nativeToScVal(2, { type: "u32" })], ["free_chapters", nativeToScVal(1, { type: "u32" })], ["created_at", nativeToScVal(5n, { type: "u64" })],
      ["sales", nativeToScVal(4, { type: "u32" })], ["seconds_read", nativeToScVal(7200n, { type: "u64" })], ["earned", nativeToScVal(90_000_000n, { type: "i128" })],
    ])));
    expect(n).toMatchObject({ id: 3, author, title: "T", price: 200_000_000n, rate: 2777n, royaltyBps: 1000, chapters: 2, freeChapters: 1, sales: 4, secondsRead: 7200, earned: 90_000_000n });
    const s = decodeStream({ active: true, deposit_left: 5n, owed_now: 1n, session_seconds: 60n, paid: 9n, seconds_left: 2n, to_own: 100n });
    expect(s).toEqual({ active: true, depositLeft: 5n, owedNow: 1n, sessionSeconds: 60, paid: 9n, secondsLeft: 2, toOwn: 100n });
  });

  it("formats amounts", () => {
    expect(amt(200_000_000n)).toBe("20");
    expect(amt(123_456_789n, 2)).toBe("12.34");
    expect(amt(12_345_000_000_000n)).toBe("1,234,500");
  });

  it("maps contract errors", () => {
    expect(inkError("HostError: Error(Contract, #8)")).toBe("You already own this novel");
    expect(waveError("Error(Contract, #5)")).toMatch(/hasn't ended/);
  });
});

describe("Writer's Wave client", () => {
  it("decodes cycles and estimates shares", () => {
    const c = decodeCycle({ id: 1, name: "S1", start: 10n, end: 20n, token: "C", pool: 4000n, total_points: 400n, participants: 2, claimed: 0n });
    expect(c).toMatchObject({ id: 1, name: "S1", start: 10, end: 20, pool: 4000n, totalPoints: 400, participants: 2 });
    expect(estShare(4000n, 100, 400)).toBe(1000n);
    expect(estShare(4000n, 0, 0)).toBe(0n);
  });
  it("encodes Action enum as u32 and optional addresses as void", () => {
    expect(type(sv.enumU32(3))).toBe("scvU32");
    expect(type(sv.optAddress(null))).toBe("scvVoid");
    expect(type(sv.optAddress(author))).toBe("scvAddress");
  });
});
