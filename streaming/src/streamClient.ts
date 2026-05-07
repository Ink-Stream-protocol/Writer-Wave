/**
 * InkStream Drips Integration
 * Manages per-second payment streams from readers to authors.
 */

export interface StreamConfig {
  receiverAddress: string; // author's EVM-compatible address
  tokenAddress: string;    // ERC-20 token (e.g. USDC)
  amountPerSecond: bigint; // in token's smallest unit
}

export interface ActiveStream {
  streamId: string;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  totalStreamed: () => bigint;
}

/**
 * Start a Drips stream to an author and wire up tab-visibility pausing.
 * Returns an ActiveStream handle so the caller can stop it on unmount.
 */
export async function startReadingStream(
  signer: unknown, // ethers Signer or equivalent
  config: StreamConfig
): Promise<ActiveStream> {
  // Dynamic import keeps the heavy SDK out of the initial bundle
  const { DripsClient } = await import("@drips-network/sdk");

  const client = new (DripsClient as any)(signer);

  const stream: ActiveStream = await client.createStream({
    receiver: config.receiverAddress,
    token: config.tokenAddress,
    amountPerSecond: config.amountPerSecond,
  });

  // Pause/resume based on tab visibility — stop billing when reader switches away
  const handleVisibility = () => {
    if (document.hidden) {
      stream.pause();
    } else {
      stream.resume();
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);

  // Wrap stop() to also clean up the listener
  const originalStop = stream.stop.bind(stream);
  stream.stop = async () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    return originalStop();
  };

  return stream;
}

/**
 * Calculate the cost to read N seconds at a given drip rate.
 */
export function estimateCost(ratePerSecond: bigint, seconds: number): bigint {
  return ratePerSecond * BigInt(Math.ceil(seconds));
}
