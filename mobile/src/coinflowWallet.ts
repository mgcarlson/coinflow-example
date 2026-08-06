import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

const DEFAULT_RPC =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim() ||
  "https://api.devnet.solana.com";

export type SolanaWallet = {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction | VersionedTransaction>(
    transaction: T
  ) => Promise<T>;
  sendTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T
  ) => Promise<string>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

export type PhantomAuth = {
  authToken: string;
  accountAddress: string;
  publicKey: PublicKey;
};

export function getSolanaConnection(): Connection {
  return new Connection(DEFAULT_RPC, "confirmed");
}

const API_BASE =
  process.env.EXPO_PUBLIC_COINFLOW_API_BASE?.replace(/\/$/, "") ||
  "https://api-sandbox.coinflow.cash/api";

/**
 * GET /auth/session-key for a connected Web3 wallet (no merchant user id).
 */
export async function fetchSessionKeyForWallet(
  walletPubkey: string
): Promise<string> {
  const auth = process.env.EXPO_PUBLIC_COINFLOW_API_KEY?.trim();
  if (!auth) {
    throw new Error("Set EXPO_PUBLIC_COINFLOW_API_KEY");
  }
  const wallet = walletPubkey.trim();
  if (!wallet) {
    throw new Error("Connect a wallet first");
  }

  const headers: Record<string, string> = {
    Authorization: auth,
    "x-coinflow-auth-wallet": wallet,
    "x-coinflow-auth-blockchain": "solana",
  };
  const mid = process.env.EXPO_PUBLIC_COINFLOW_MERCHANT_ID?.trim();
  if (mid) headers["x-coinflow-auth-merchant-id"] = mid;

  const res = await fetch(`${API_BASE}/auth/session-key`, { headers });
  const text = await res.text();
  let data: { key?: string };
  try {
    data = JSON.parse(text) as { key?: string };
  } catch {
    throw new Error(`Session key ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !data.key) {
    throw new Error(`Session key ${res.status}: ${text.slice(0, 200)}`);
  }
  return data.key;
}
