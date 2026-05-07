"use client";

import { useState } from "react";
import ReadingStream from "@/components/ReadingStream";
import BuyButton from "@/components/BuyButton";

interface Props {
  params: { title: string };
}

export default function NovelPage({ params }: Props) {
  const title = decodeURIComponent(params.title);
  const [mode, setMode] = useState<"buy" | "stream" | null>(null);

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      <p className="text-gray-400 mb-8">
        Choose how you want to read this novel.
      </p>

      {!mode && (
        <div className="flex gap-4">
          <button
            onClick={() => setMode("buy")}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-semibold transition"
          >
            🏛 Buy Forever
            <span className="block text-sm font-normal opacity-75">
              One-time payment via Soroban
            </span>
          </button>
          <button
            onClick={() => setMode("stream")}
            className="flex-1 bg-teal-700 hover:bg-teal-600 text-white py-4 rounded-xl font-semibold transition"
          >
            🌊 Stream to Read
            <span className="block text-sm font-normal opacity-75">
              Pay per second via Drips
            </span>
          </button>
        </div>
      )}

      {mode === "buy" && <BuyButton title={title} onBack={() => setMode(null)} />}
      {mode === "stream" && <ReadingStream title={title} onBack={() => setMode(null)} />}
    </main>
  );
}
