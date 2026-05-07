"use client";

import { useState } from "react";

interface Props {
  title: string;
  onBack: () => void;
}

/**
 * Calls the InkStream Soroban contract's buy_full function.
 * TODO (issue): wire up real Freighter wallet + contract invocation.
 */
export default function BuyButton({ title, onBack }: Props) {
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function handleBuy() {
    setStatus("pending");
    try {
      // TODO: replace with real Soroban contract call via @stellar/stellar-sdk
      await new Promise((r) => setTimeout(r, 1500)); // simulate tx
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-8 p-6 bg-indigo-950 rounded-xl text-center">
        <p className="text-2xl mb-2">🎉 You own <strong>{title}</strong>!</p>
        <p className="text-gray-400 text-sm">Stored on-chain via Soroban persistent storage.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <button
        onClick={handleBuy}
        disabled={status === "pending"}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition"
      >
        {status === "pending" ? "Processing transaction…" : "Confirm Purchase"}
      </button>
      {status === "error" && (
        <p className="text-red-400 text-sm text-center">Transaction failed. Try again.</p>
      )}
      <button onClick={onBack} className="w-full text-gray-500 hover:text-gray-300 text-sm">
        ← Back
      </button>
    </div>
  );
}
