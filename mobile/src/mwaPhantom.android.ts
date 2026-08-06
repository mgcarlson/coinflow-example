import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  transact,
  type Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import type { PhantomAuth, SolanaWallet } from "./coinflowWallet";

const MWA_CHAIN =
  process.env.EXPO_PUBLIC_SOLANA_CLUSTER?.trim() === "mainnet-beta"
    ? "solana:mainnet"
    : "solana:devnet";

export const APP_IDENTITY = {
  name: "Coinflow Withdraw RN",
  uri: "https://coinflow.cash",
  icon: "favicon.ico",
};

async function authorizeSession(
  wallet: Web3MobileWallet,
  authToken?: string
) {
  return wallet.authorize({
    auth_token: authToken,
    chain: MWA_CHAIN,
    identity: APP_IDENTITY,
  });
}

/** Connect to Phantom (or any MWA wallet) on Android via Mobile Wallet Adapter. */
export async function connectPhantomMobile(
  existingAuthToken?: string
): Promise<PhantomAuth> {
  return transact(async (wallet) => {
    const result = await authorizeSession(wallet, existingAuthToken);
    const account = result.accounts[0];
    if (!account) {
      throw new Error("Wallet did not return an account");
    }
    return {
      authToken: result.auth_token,
      accountAddress: account.address,
      publicKey: new PublicKey(
        Uint8Array.from(Buffer.from(account.address, "base64"))
      ),
    };
  });
}

/** Disconnect / revoke the MWA auth token in the wallet app. */
export async function disconnectPhantomMobile(authToken: string): Promise<void> {
  await transact(async (wallet) => {
    await wallet.deauthorize({ auth_token: authToken });
  });
}

/**
 * Persistent Coinflow wallet backed by MWA.
 * Each signing request opens a short MWA session with the stored auth token.
 */
export function createMwaCoinflowWallet(
  auth: PhantomAuth,
  connection: Connection
): SolanaWallet & { publicKey: PublicKey } {
  void connection;
  const withWallet = async <T>(
    fn: (
      wallet: Web3MobileWallet,
      authorization: Awaited<ReturnType<typeof authorizeSession>>
    ) => Promise<T>
  ) =>
    transact(async (wallet) => {
      const authorization = await authorizeSession(wallet, auth.authToken);
      return fn(wallet, authorization);
    });

  return {
    publicKey: auth.publicKey,
    signTransaction: async (transaction) =>
      withWallet(async (wallet) => {
        const signed = await wallet.signTransactions({
          transactions: [transaction],
        });
        return signed[0];
      }),
    sendTransaction: async (transaction) =>
      withWallet(async (wallet) => {
        const signatures = await wallet.signAndSendTransactions({
          transactions: [transaction],
        });
        return signatures[0];
      }),
    signMessage: async (message) =>
      withWallet(async (wallet, authorization) => {
        const address =
          authorization.accounts[0]?.address ?? auth.accountAddress;
        const signed = await wallet.signMessages({
          addresses: [address],
          payloads: [message],
        });
        const signature = signed[0];
        if (!signature) {
          throw new Error("Wallet did not return a message signature");
        }
        return signature;
      }),
  };
}
