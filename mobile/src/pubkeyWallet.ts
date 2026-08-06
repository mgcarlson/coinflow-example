import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import type { SolanaWallet } from "./coinflowWallet";

const SIGNING_UNAVAILABLE =
  "On-chain signing is not available for a pasted address on the simulator. " +
  "Use this to load withdraw UI for a funded wallet; complete signed flows on web/Android with Phantom.";

export function parseSolanaAddress(address: string): PublicKey {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Enter a Solana wallet address");
  }
  try {
    return new PublicKey(trimmed);
  } catch {
    throw new Error("Invalid Solana address (expected base58 pubkey)");
  }
}

/**
 * Coinflow wallet identified by pubkey only (no private key).
 * Use on iOS Simulator when Phantom is unavailable but you need a real funded address.
 */
export function createPubkeyWallet(
  address: string,
  connection: Connection
): SolanaWallet & { publicKey: PublicKey } {
  const publicKey = parseSolanaAddress(address);
  void connection;

  const rejectSigning = async (): Promise<never> => {
    throw new Error(SIGNING_UNAVAILABLE);
  };

  return {
    publicKey,
    signTransaction: rejectSigning,
    sendTransaction: rejectSigning,
    signMessage: rejectSigning,
  };
}

export function isPubkeyWalletSigningError(message: string): boolean {
  return message.includes(SIGNING_UNAVAILABLE);
}
