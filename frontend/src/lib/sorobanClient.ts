import { Contract, SorobanRpc, TransactionBuilder, Networks, BASE_FEE } from "@stellar/stellar-sdk";

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC ?? "https://soroban-testnet.stellar.org";

export function getServer() {
  return new SorobanRpc.Server(RPC_URL);
}

export function getContract() {
  return new Contract(CONTRACT_ID);
}

/**
 * Build a buy_full transaction for the user to sign with Freighter.
 * TODO (issue): add Freighter wallet integration.
 */
export async function buildBuyTx(
  readerPublicKey: string,
  title: string,
  tokenAddress: string
) {
  const server = getServer();
  const account = await server.getAccount(readerPublicKey);
  const contract = getContract();

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call("buy_full", ...[
        // xdr args built by stellar-sdk — placeholder for issue implementation
      ] as any)
    )
    .setTimeout(30)
    .build();

  return tx;
}
