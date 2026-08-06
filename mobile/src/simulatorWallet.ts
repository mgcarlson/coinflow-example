import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";

import type { SolanaWallet } from "./coinflowWallet";

const SIMULATOR_SEED_LABEL = "coinflow-ios-simulator-dev-wallet";

function keypairFromLabel(label: string): Keypair {
  const hash = sha256(new TextEncoder().encode(label));
  return Keypair.fromSeed(hash.slice(0, 32));
}

/** In-memory dev wallet for iOS Simulator (Phantom is not available there). */
export async function connectSimulatorWallet(): Promise<{
  publicKey: PublicKey;
  wallet: SolanaWallet & { publicKey: PublicKey };
}> {
  const keypair = keypairFromLabel(SIMULATOR_SEED_LABEL);
  const connection = new Connection(
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim() ||
      "https://api.devnet.solana.com",
    "confirmed"
  );

  const wallet: SolanaWallet & { publicKey: PublicKey } = {
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

  return { publicKey: keypair.publicKey, wallet };
}
