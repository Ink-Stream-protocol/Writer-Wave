import { Networks } from "@stellar/stellar-sdk";

export type NetworkName = "testnet" | "mainnet";

export interface NetworkConfig {
  name: NetworkName;
  horizonUrl: string;
  passphrase: string;
  friendbotUrl?: string;
  sorobanRpcUrl: string;
  explorer: string;
  defaultAnchor: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: "testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    passphrase: Networks.TESTNET,
    friendbotUrl: "https://friendbot.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    explorer: "https://stellar.expert/explorer/testnet",
    defaultAnchor: "testanchor.stellar.org",
  },
  mainnet: {
    name: "mainnet",
    horizonUrl: "https://horizon.stellar.org",
    // No SDF-hosted public mainnet RPC: set VITE_SOROBAN_RPC_URL to a provider (e.g. from developers.stellar.org/docs/data/rpc/rpc-providers)
    sorobanRpcUrl: "",
    passphrase: Networks.PUBLIC,
    explorer: "https://stellar.expert/explorer/public",
    defaultAnchor: "",
  },
};

// Network is chosen at build time. Default is testnet so nothing real is at risk.
const base: NetworkConfig =
  NETWORKS[(import.meta.env?.VITE_STELLAR_NETWORK as NetworkName) || "testnet"] ?? NETWORKS.testnet;
export const NETWORK: NetworkConfig = {
  ...base,
  sorobanRpcUrl: (import.meta.env?.VITE_SOROBAN_RPC_URL as string) || base.sorobanRpcUrl,
};

/** Product name — change it here to rebrand the whole app. */
export const BRAND = "InkStream";
/** The built-in wallet's name. */
export const WALLET_NAME = "Starling";

const env = (k: string): string => ((import.meta.env?.[k] as string) || "").trim();

/** Contract IDs — written to .env by scripts/deploy.sh. */
export const INK_CONTRACT_ID = env("VITE_INK_CONTRACT_ID");
export const WAVE_CONTRACT_ID = env("VITE_WAVE_CONTRACT_ID");
export const ESCROW_CONTRACT_ID = env("VITE_ESCROW_CONTRACT_ID");
/** Any funded account, used as the source for read-only simulations before a wallet connects. */
export const READ_ACCOUNT = env("VITE_READ_ACCOUNT");
/** Display symbol of the payment token InkStream was deployed with. */
export const PAY_SYMBOL = env("VITE_PAY_SYMBOL") || "XLM";
