// Generic Soroban contract helpers: read-only simulation and signed invocation.
import {
  Account,
  Address,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { NETWORK, READ_ACCOUNT } from "./config";
import type { Signer } from "./signer";

const STROOPS = 10_000_000n;

let _rpc: rpc.Server | null = null;
export const sorobanServer = () =>
  (_rpc ??= new rpc.Server(NETWORK.sorobanRpcUrl, { allowHttp: NETWORK.sorobanRpcUrl.startsWith("http://") }));

const fallbackReader = Keypair.random().publicKey();

// ── amounts ──────────────────────────────────────────────────────────────────

export function toStroops(amount: string): bigint {
  const a = amount.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(a)) throw new Error("Amount must be a positive number with up to 7 decimals");
  const [whole, frac = ""] = a.split(".");
  const v = BigInt(whole) * STROOPS + BigInt(frac.padEnd(7, "0"));
  if (v <= 0n) throw new Error("Amount must be greater than zero");
  return v;
}

export function fromStroops(v: bigint | number | string): string {
  const b = BigInt(v);
  const neg = b < 0n;
  const a = neg ? -b : b;
  const s = `${a / STROOPS}.${(a % STROOPS).toString().padStart(7, "0")}`.replace(/\.?0+$/, "");
  return (neg ? "-" : "") + s;
}

// ── ScVal builders ───────────────────────────────────────────────────────────

export const sv = {
  address: (a: string) => new Address(a).toScVal(),
  i128: (v: bigint) => nativeToScVal(v, { type: "i128" }),
  u64: (v: bigint | number) => nativeToScVal(BigInt(v), { type: "u64" }),
  u32: (v: number) => nativeToScVal(v, { type: "u32" }),
  str: (v: string) => nativeToScVal(v, { type: "string" }),
  optAddress: (a?: string | null) => (a ? new Address(a).toScVal() : xdr.ScVal.scvVoid()),
  /** Unit-variant integer enums (#[repr(u32)] contracttype) encode as u32. */
  enumU32: (v: number) => nativeToScVal(v, { type: "u32" }),
};

// ── errors ───────────────────────────────────────────────────────────────────

export function contractErrorCode(msg: string): number | null {
  const m = msg.match(/Error\(Contract, #(\d+)\)/);
  return m ? Number(m[1]) : null;
}

export function friendlyError(msg: string, table: Record<number, string> = {}): string {
  const code = contractErrorCode(msg);
  if (code !== null) return table[code] ?? `Contract error #${code}`;
  if (/balance is not sufficient|resulting balance is not within/i.test(msg)) return "Insufficient balance";
  if (/trustline entry is missing/i.test(msg)) return "That account can't hold this asset yet (no trustline)";
  if (/Account not found/i.test(msg)) return "Your account isn't activated yet — fund it first";
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

// ── calls ────────────────────────────────────────────────────────────────────

function call(contract: string, fn: string, args: xdr.ScVal[]) {
  return Operation.invokeContractFunction({ contract, function: fn, args });
}

/** Read-only call via simulation (free, no signature). */
export async function readContract<T = unknown>(
  contract: string, fn: string, args: xdr.ScVal[], opts: { source?: string; errors?: Record<number, string> } = {},
): Promise<T> {
  const source = opts.source || READ_ACCOUNT || fallbackReader;
  const tx = new TransactionBuilder(new Account(source, "0"), { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(call(contract, fn, args)).setTimeout(30).build();
  const sim = await sorobanServer().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(friendlyError(sim.error, opts.errors));
  return (sim.result?.retval ? scValToNative(sim.result.retval) : undefined) as T;
}

/** State-changing call: simulate → assemble → sign (any wallet) → send → wait for the result. */
export async function invokeContract<T = unknown>(
  signer: Signer, contract: string, fn: string, args: xdr.ScVal[], errors: Record<number, string> = {},
): Promise<{ hash: string; value: T }> {
  const s = sorobanServer();
  let source;
  try {
    source = await s.getAccount(signer.publicKey);
  } catch {
    throw new Error("Your account isn't activated yet — fund it first");
  }
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(call(contract, fn, args)).setTimeout(120).build();
  let prepared;
  try {
    prepared = await s.prepareTransaction(tx);
  } catch (e) {
    throw new Error(friendlyError(e instanceof Error ? e.message : String(e), errors));
  }
  let signedXdr: string;
  try {
    signedXdr = await signer.sign(prepared.toXDR());
  } catch (e) {
    throw new Error(`Signing was cancelled or failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const sent = await s.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase));
  if (sent.status === "ERROR") throw new Error("The network rejected the transaction");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await s.getTransaction(sent.hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash: sent.hash, value: (res.returnValue ? scValToNative(res.returnValue) : undefined) as T };
    }
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error("The contract call failed on-chain");
  }
  throw new Error("Timed out waiting for confirmation — check the explorer");
}
