// Client for the Writer's Wave contract (contracts/writer_wave, Rust).
import { NETWORK, WAVE_CONTRACT_ID } from "./config";
import type { Signer } from "./signer";
import { friendlyError, invokeContract, readContract, sv, toStroops } from "./soroban";

export const waveEnabled = () => !!WAVE_CONTRACT_ID && !!NETWORK.sorobanRpcUrl;

export const WAVE_ERRORS: Record<number, string> = {
  1: "Sprint not found",
  2: "The sprint must end after it starts, in the future",
  3: "Sprints can't overlap — start after the current one ends",
  4: "Not an approved reporter",
  5: "This sprint hasn't ended yet",
  6: "Already claimed",
  7: "No points in this sprint, so nothing to claim",
  8: "Amount must be greater than zero",
  9: "This sprint has ended",
  10: "No sprint is running right now",
};
export const waveError = (m: string) => friendlyError(m, WAVE_ERRORS);

export const ACTIONS = [
  { key: "Chapter", label: "Publish a chapter", who: "Authors", note: "max once per novel per day" },
  { key: "Streak", label: "Weekly streak bonus", who: "Authors", note: "× streak length, each consecutive week with a chapter" },
  { key: "Purchase", label: "Sell a copy", who: "Authors", note: "buy-forever or stream-to-own" },
  { key: "Resale", label: "Your book is resold", who: "Authors", note: "plus your royalty" },
  { key: "ReadHour", label: "Read for an hour", who: "Readers", note: "per full hour streamed" },
  { key: "Engagement", label: "An hour of your book is read", who: "Authors", note: "per reader-hour" },
  { key: "Contribution", label: "Contribute to InkStream", who: "Everyone", note: "issues, PRs, docs — awarded per task" },
] as const;

export interface Cycle {
  id: number;
  name: string;
  start: number;
  end: number;
  token: string;
  pool: bigint;
  totalPoints: number;
  participants: number;
  claimed: bigint;
}
export interface Standing { user: string; points: number }

type Raw = Record<string, unknown>;
export function decodeCycle(v: unknown): Cycle {
  const o = v as Raw;
  return {
    id: Number(o.id), name: String(o.name), start: Number(o.start), end: Number(o.end), token: String(o.token),
    pool: BigInt((o.pool as bigint) ?? 0), totalPoints: Number(o.total_points), participants: Number(o.participants), claimed: BigInt((o.claimed as bigint) ?? 0),
  };
}

const read = <T,>(fn: string, args: Parameters<typeof readContract>[2]) => readContract<T>(WAVE_CONTRACT_ID, fn, args, { errors: WAVE_ERRORS });
const write = <T,>(signer: Signer, fn: string, args: Parameters<typeof invokeContract>[3]) => invokeContract<T>(signer, WAVE_CONTRACT_ID, fn, args, WAVE_ERRORS);

export const getAdmin = () => read<string>("admin", []);
export const cycleCount = async () => Number(await read<number>("cycle_count", []));
export const getCycle = async (id: number) => decodeCycle(await read("cycle", [sv.u32(id)]));
export const liveCycle = async () => { const c = await read<unknown>("live", []); return c ? decodeCycle(c) : null; };
export const pointsOf = async (cycle: number, user: string) => Number(await read("points_of", [sv.u32(cycle), sv.address(user)]));
export const claimable = async (cycle: number, user: string) => BigInt((await read<bigint>("claimable", [sv.u32(cycle), sv.address(user)])) ?? 0);
export const hasClaimed = (cycle: number, user: string) => read<boolean>("has_claimed", [sv.u32(cycle), sv.address(user)]);
export const pointValues = async () => ((await read<number[]>("point_values", [])) ?? []).map(Number);
export const standings = async (cycle: number): Promise<Standing[]> =>
  ((await read<Raw[]>("standings", [sv.u32(cycle)])) ?? [])
    .map((s) => ({ user: String(s.user), points: Number(s.points) }))
    .sort((a, b) => b.points - a.points);

export const fundPool = (signer: Signer, cycle: number, amount: string) => write(signer, "fund", [sv.address(signer.publicKey), sv.u32(cycle), sv.i128(toStroops(amount))]);
export const claimReward = (signer: Signer, cycle: number) => write<bigint>(signer, "claim", [sv.address(signer.publicKey), sv.u32(cycle)]);

// admin
export const startCycle = (signer: Signer, name: string, start: number, end: number, token: string) =>
  write<number>(signer, "start_cycle", [sv.str(name), sv.u64(start), sv.u64(end), sv.address(token)]);
export const awardPoints = (signer: Signer, user: string, points: number) => write(signer, "award", [sv.address(user), sv.u64(points)]);
export const setPointValue = (signer: Signer, actionIndex: number, points: number) => write(signer, "set_points", [sv.enumU32(actionIndex), sv.u32(points)]);

/** Estimated share of a pool for `points` out of `total`. */
export const estShare = (pool: bigint, points: number, total: number) => (total > 0 ? (pool * BigInt(points)) / BigInt(total) : 0n);
