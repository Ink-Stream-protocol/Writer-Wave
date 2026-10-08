// Client for the Safe pay escrow contract (contracts/escrow, Rust).
import type { xdr } from "@stellar/stellar-sdk";
import { ESCROW_CONTRACT_ID, NETWORK } from "./config";
import type { Signer } from "./signer";
import { parseAsset } from "./stellar";
import { friendlyError, fromStroops, invokeContract, readContract, sv, toStroops } from "./soroban";

export { fromStroops, toStroops };

export type EscrowStatus = "Funded" | "Released" | "Refunded";

export interface EscrowRecord {
  id: number;
  buyer: string;
  seller: string;
  token: string;
  amount: string;
  deadline: number;
  createdAt: number;
  status: EscrowStatus;
  memo: string;
}

const ERRORS: Record<number, string> = {
  1: "Escrow not found",
  2: "Amount must be greater than zero",
  3: "Deadline must be in the future",
  4: "This escrow is already settled",
  5: "Only the buyer or seller can do that",
  6: "The buyer can only refund after the deadline",
  7: "Buyer and seller must be different",
  8: "Note is too long",
};

export const friendlyContractError = (msg: string) => friendlyError(msg, ERRORS);
export const escrowEnabled = () => !!ESCROW_CONTRACT_ID && !!NETWORK.sorobanRpcUrl;

/** Stellar Asset Contract address for a classic asset ("XLM" or "CODE:ISSUER"). */
export function tokenContractId(assetId: string): string {
  return parseAsset(assetId).contractId(NETWORK.passphrase);
}

export function createArgs(p: { buyer: string; seller: string; token: string; amount: string; deadline: number; memo: string }): xdr.ScVal[] {
  if (new TextEncoder().encode(p.memo).length > 64) throw new Error("Note must be 64 characters or fewer");
  return [sv.address(p.buyer), sv.address(p.seller), sv.address(p.token), sv.i128(toStroops(p.amount)), sv.u64(p.deadline), sv.str(p.memo)];
}

export function decodeEscrow(v: unknown): EscrowRecord {
  const o = v as Record<string, unknown>;
  const status = Array.isArray(o.status) ? String(o.status[0]) : String(o.status);
  return {
    id: Number(o.id), buyer: String(o.buyer), seller: String(o.seller), token: String(o.token),
    amount: fromStroops(o.amount as bigint), deadline: Number(o.deadline), createdAt: Number(o.created_at),
    status: status as EscrowStatus, memo: String(o.memo ?? ""),
  };
}

export async function createEscrow(signer: Signer, p: { seller: string; assetId: string; amount: string; deadline: number; memo: string }) {
  const args = createArgs({ buyer: signer.publicKey, seller: p.seller, token: tokenContractId(p.assetId), amount: p.amount, deadline: p.deadline, memo: p.memo });
  const r = await invokeContract<bigint>(signer, ESCROW_CONTRACT_ID, "create", args, ERRORS);
  return { hash: r.hash, id: Number(r.value) };
}

export const releaseEscrow = (signer: Signer, id: number) => invokeContract(signer, ESCROW_CONTRACT_ID, "release", [sv.u64(id)], ERRORS);
export const refundEscrow = (signer: Signer, id: number) => invokeContract(signer, ESCROW_CONTRACT_ID, "refund", [sv.u64(id), sv.address(signer.publicKey)], ERRORS);

export async function listEscrows(viewer: string, limit = 50): Promise<EscrowRecord[]> {
  const raw = await readContract<unknown[]>(ESCROW_CONTRACT_ID, "list", [sv.u64(0), sv.u32(limit)], { source: viewer, errors: ERRORS });
  return (raw ?? []).map(decodeEscrow);
}

export function tokenLabel(tokenId: string, knownAssetIds: string[]): string {
  for (const id of ["XLM", ...knownAssetIds]) {
    try { if (tokenContractId(id) === tokenId) return id === "XLM" ? "XLM" : id.split(":")[0]; } catch { /* skip */ }
  }
  return `${tokenId.slice(0, 4)}…${tokenId.slice(-4)}`;
}
