// InkStream protocol constants

export const SOROBAN_NETWORK = {
  TESTNET: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  MAINNET: {
    rpcUrl: "https://soroban-mainnet.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
} as const;

export const DRIPS_CHAIN_ID = 314; // Filecoin mainnet (Drips v3 deployment)

// Minimum stream duration before a session is counted toward Wave points
export const MIN_READ_SECONDS = 60;

// Resale royalty default (basis points)
export const DEFAULT_ROYALTY_BPS = 1000; // 10%
