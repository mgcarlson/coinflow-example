import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  type PublicKey,
} from "@solana/web3.js";
import type { SolanaWallet } from "@coinflowlabs/react";
import nacl from "tweetnacl";

const DEFAULT_RPC =
  import.meta.env.VITE_SOLANA_RPC_URL?.trim() ||
  "https://api.devnet.solana.com";

export function getSolanaConnection(): Connection {
  return new Connection(DEFAULT_RPC, "confirmed");
}

export async function getSolanaKeypairFromUserId(
  userId: string
): Promise<Keypair> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(userId.trim()) as BufferSource
  );
  const seed = new Uint8Array(hash).slice(0, 32);
  return Keypair.fromSeed(seed);
}

/** In-memory Solana wallet for CoinflowWithdraw (direct-user-withdrawal pattern). */
export function createSolanaWallet(
  keypair: Keypair,
  connection: Connection
): SolanaWallet & { publicKey: PublicKey } {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      transaction: T
    ) => {
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([keypair]);
      } else {
        transaction.partialSign(keypair);
      }
      return transaction;
    },
    sendTransaction: async <T extends Transaction | VersionedTransaction>(
      transaction: T
    ) => {
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([keypair]);
        return connection.sendRawTransaction(transaction.serialize());
      }
      transaction.partialSign(keypair);
      return connection.sendRawTransaction(transaction.serialize());
    },
    signMessage: async (message: Uint8Array) =>
      nacl.sign.detached(message, keypair.secretKey.subarray(0, 32)),
  };
}
