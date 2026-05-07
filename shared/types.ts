// Shared types for InkStream — used by both frontend and drips packages

export interface Novel {
  title: string;
  author: string;         // Stellar address
  authorEvm: string;      // EVM address for Drips streams
  coverUrl: string;
  description: string;
  priceFull: string;      // in XLM (display value)
  dripRate: string;       // in USDC per second (display value)
  dripRateRaw: bigint;    // raw bigint for Drips SDK
  priceStellar: number;   // in stroops for Soroban contract
}

export interface ReadSession {
  novelTitle: string;
  mode: "buy" | "stream";
  startedAt: number;      // unix ms
  streamId?: string;
}

export type WavePoints = {
  address: string;
  points: number;
  rank: number;
};
