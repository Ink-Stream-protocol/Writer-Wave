"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  onBack: () => void;
}

/**
 * Starts a Drips stream when the reader opens the novel.
 * Pauses automatically when the tab is hidden.
 * TODO (issue): wire up real wallet signer + streaming/src/streamClient.ts
 */
export default function ReadingStream({ title, onBack }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [streaming, setStreaming] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate the tick — replace with real stream.totalStreamed() in a future issue
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!document.hidden) {
        setElapsed((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, []);

  useEffect(() => {
    const handler = () => setStreaming(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const RATE = 0.0001; // USDC per second (display only)
  const cost = (elapsed * RATE).toFixed(6);

  return (
    <div className="mt-8 space-y-6">
      <div className="bg-teal-950 rounded-xl p-6 text-center">
        <p className="text-4xl font-mono font-bold text-teal-300">{cost} USDC</p>
        <p className="text-gray-400 text-sm mt-1">streamed to author · {elapsed}s read</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${streaming ? "bg-teal-400 animate-pulse" : "bg-gray-600"}`}
          />
          <span className="text-xs text-gray-400">
            {streaming ? "Stream active" : "Stream paused (tab hidden)"}
          </span>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 h-64 overflow-y-auto">
        <p className="text-gray-300 leading-relaxed">
          {/* TODO (issue): fetch and render actual chapter content */}
          Chapter 1 content for <strong>{title}</strong> will appear here.
          Connect your wallet and start streaming to unlock the full text.
        </p>
      </div>

      <button onClick={onBack} className="w-full text-gray-500 hover:text-gray-300 text-sm">
        ← Stop reading & end stream
      </button>
    </div>
  );
}
