/**
 * DripList Manager
 * Manages a reader's DripList — the curated set of authors they support.
 * Used for the Writer's Wave reward pool distribution.
 */

export interface DripEntry {
  authorAddress: string;
  weight: number; // relative weight out of 1_000_000
}

export interface DripListConfig {
  name: string;
  entries: DripEntry[];
}

/**
 * Create or update a reader's DripList on the Drips protocol.
 * Weights must sum to 1_000_000.
 */
export async function upsertDripList(
  signer: unknown,
  config: DripListConfig
): Promise<string> {
  const totalWeight = config.entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight !== 1_000_000) {
    throw new Error(`DripList weights must sum to 1_000_000, got ${totalWeight}`);
  }

  const { DripsClient } = await import("@drips-network/sdk");
  const client = new (DripsClient as any)(signer);

  const listId: string = await client.upsertDripList({
    name: config.name,
    recipients: config.entries.map((e) => ({
      address: e.authorAddress,
      weight: e.weight,
    })),
  });

  return listId;
}
