import * as Linking from "expo-linking";
import bs58 from "bs58";
import { Buffer } from "buffer";
import nacl from "tweetnacl";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { PhantomAuth, SolanaWallet } from "./coinflowWallet";

const APP_URL = "https://coinflow.cash";

const CLUSTER =
  process.env.EXPO_PUBLIC_SOLANA_CLUSTER?.trim() === "mainnet-beta"
    ? "mainnet-beta"
    : "devnet";

const onConnectRedirect = Linking.createURL("phantom/onConnect");
const onSignAndSendRedirect = Linking.createURL("phantom/onSignAndSend");
const onSignRedirect = Linking.createURL("phantom/onSign");
const onSignMessageRedirect = Linking.createURL("phantom/onSignMessage");
const onDisconnectRedirect = Linking.createURL("phantom/onDisconnect");

function buildPhantomUrl(path: string, params: URLSearchParams): string {
  return `phantom://v1/${path}?${params.toString()}`;
}

function encryptPayload(payload: unknown, sharedSecret: Uint8Array) {
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box.after(
    Buffer.from(JSON.stringify(payload)),
    nonce,
    sharedSecret
  );
  return { nonce, encrypted };
}

function decryptPayload(
  data: string,
  nonce: string,
  sharedSecret: Uint8Array
): Record<string, string> {
  const decrypted = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedSecret
  );
  if (!decrypted) throw new Error("Unable to decrypt Phantom response");
  return JSON.parse(Buffer.from(decrypted).toString("utf8")) as Record<
    string,
    string
  >;
}

function serializeTransaction(tx: Transaction | VersionedTransaction): string {
  const bytes =
    tx instanceof VersionedTransaction
      ? tx.serialize()
      : tx.serialize({ requireAllSignatures: false });
  return bs58.encode(bytes);
}

function deserializeTransaction(
  encoded: string
): Transaction | VersionedTransaction {
  const bytes = bs58.decode(encoded);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

type Pending =
  | {
      kind: "connect";
      resolve: (v: PhantomAuth) => void;
      reject: (e: Error) => void;
    }
  | {
      kind: "signAndSend";
      resolve: (sig: string) => void;
      reject: (e: Error) => void;
    }
  | {
      kind: "sign";
      resolve: (tx: Transaction | VersionedTransaction) => void;
      reject: (e: Error) => void;
    }
  | {
      kind: "signMessage";
      resolve: (sig: Uint8Array) => void;
      reject: (e: Error) => void;
    };

class PhantomDeeplinkSession {
  private dappKeyPair = nacl.box.keyPair();
  private sharedSecret?: Uint8Array;
  private session?: string;
  private publicKey?: PublicKey;
  private pending?: Pending;
  private subscription?: { remove: () => void };

  start() {
    if (this.subscription) return;
    void Linking.getInitialURL().then((url) => {
      if (url) this.handleUrl(url);
    });
    this.subscription = Linking.addEventListener("url", (e) =>
      this.handleUrl(e.url)
    );
  }

  stop() {
    this.subscription?.remove();
    this.subscription = undefined;
  }

  isConnected(): boolean {
    return Boolean(this.session && this.publicKey && this.sharedSecret);
  }

  getPublicKey(): PublicKey | null {
    return this.publicKey ?? null;
  }

  private rejectPending(err: Error) {
    if (this.pending) {
      this.pending.reject(err);
      this.pending = undefined;
    }
  }

  private clearSession() {
    this.sharedSecret = undefined;
    this.session = undefined;
    this.publicKey = undefined;
  }

  private handleUrl(url: string) {
    try {
      const parsed = new URL(url);
      const path = `${parsed.pathname}${parsed.host ? `/${parsed.host}` : ""}`;
      const params = parsed.searchParams;

      if (params.get("errorCode")) {
        this.rejectPending(
          new Error(
            params.get("errorMessage") ||
              params.get("errorCode") ||
              "Phantom rejected request"
          )
        );
        return;
      }

      if (/onConnect/i.test(path)) {
        const phantomPub = params.get("phantom_encryption_public_key");
        const data = params.get("data");
        const nonce = params.get("nonce");
        if (!phantomPub || !data || !nonce) return;

        const shared = nacl.box.before(
          bs58.decode(phantomPub),
          this.dappKeyPair.secretKey
        );
        const connectData = decryptPayload(data, nonce, shared);
        this.sharedSecret = shared;
        this.session = connectData.session;
        this.publicKey = new PublicKey(connectData.public_key);

        const auth: PhantomAuth = {
          authToken: connectData.session,
          accountAddress: connectData.public_key,
          publicKey: this.publicKey,
        };
        if (this.pending?.kind === "connect") {
          this.pending.resolve(auth);
          this.pending = undefined;
        }
        return;
      }

      if (!this.sharedSecret) return;

      const data = params.get("data");
      const nonce = params.get("nonce");
      if (!data || !nonce) return;

      if (/onSignAndSend/i.test(path)) {
        const result = decryptPayload(data, nonce, this.sharedSecret);
        if (this.pending?.kind === "signAndSend" && result.signature) {
          this.pending.resolve(result.signature);
          this.pending = undefined;
        }
        return;
      }

      if (/onSignTransaction/i.test(path)) {
        const result = decryptPayload(data, nonce, this.sharedSecret);
        if (this.pending?.kind === "sign" && result.transaction) {
          this.pending.resolve(deserializeTransaction(result.transaction));
          this.pending = undefined;
        }
        return;
      }

      if (/onSignMessage/i.test(path)) {
        const result = decryptPayload(data, nonce, this.sharedSecret);
        if (this.pending?.kind === "signMessage" && result.signature) {
          this.pending.resolve(bs58.decode(result.signature));
          this.pending = undefined;
        }
        return;
      }

      if (/onDisconnect/i.test(path)) {
        this.clearSession();
      }
    } catch (e) {
      this.rejectPending(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private open(path: string, params: URLSearchParams) {
    return Linking.openURL(buildPhantomUrl(path, params));
  }

  connect(): Promise<PhantomAuth> {
    if (this.isConnected() && this.publicKey && this.session) {
      return Promise.resolve({
        authToken: this.session,
        accountAddress: this.publicKey.toBase58(),
        publicKey: this.publicKey,
      });
    }

    return new Promise((resolve, reject) => {
      this.pending = { kind: "connect", resolve, reject };
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        cluster: CLUSTER,
        app_url: APP_URL,
        redirect_link: onConnectRedirect,
      });
      void this.open("connect", params).catch((e) => {
        this.rejectPending(
          e instanceof Error ? e : new Error("Failed to open Phantom")
        );
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.session || !this.sharedSecret) {
      this.clearSession();
      return;
    }
    const { nonce, encrypted } = encryptPayload(
      { session: this.session },
      this.sharedSecret
    );
    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: onDisconnectRedirect,
      payload: bs58.encode(encrypted),
    });
    const session = this.session;
    this.clearSession();
    await this.open("disconnect", params);
    void session;
  }

  signAndSendTransaction(
    tx: Transaction | VersionedTransaction
  ): Promise<string> {
    if (!this.session || !this.sharedSecret) {
      return Promise.reject(new Error("Phantom not connected"));
    }

    return new Promise((resolve, reject) => {
      this.pending = { kind: "signAndSend", resolve, reject };
      const { nonce, encrypted } = encryptPayload(
        {
          session: this.session,
          transaction: serializeTransaction(tx),
        },
        this.sharedSecret!
      );
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: onSignAndSendRedirect,
        payload: bs58.encode(encrypted),
      });
      void this.open("signAndSendTransaction", params).catch(reject);
    });
  }

  signTransaction(
    tx: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction> {
    if (!this.session || !this.sharedSecret) {
      return Promise.reject(new Error("Phantom not connected"));
    }

    return new Promise((resolve, reject) => {
      this.pending = { kind: "sign", resolve, reject };
      const { nonce, encrypted } = encryptPayload(
        {
          session: this.session,
          transaction: serializeTransaction(tx),
        },
        this.sharedSecret!
      );
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: onSignRedirect,
        payload: bs58.encode(encrypted),
      });
      void this.open("signTransaction", params).catch(reject);
    });
  }

  signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.session || !this.sharedSecret) {
      return Promise.reject(new Error("Phantom not connected"));
    }

    return new Promise((resolve, reject) => {
      this.pending = { kind: "signMessage", resolve, reject };
      const { nonce, encrypted } = encryptPayload(
        {
          session: this.session,
          message: bs58.encode(message),
        },
        this.sharedSecret!
      );
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: onSignMessageRedirect,
        payload: bs58.encode(encrypted),
      });
      void this.open("signMessage", params).catch(reject);
    });
  }
}

export const phantomDeeplink = new PhantomDeeplinkSession();

export function createPhantomDeeplinkWallet(
  connection: Connection
): SolanaWallet & { publicKey: PublicKey } {
  const publicKey = phantomDeeplink.getPublicKey();
  if (!publicKey) throw new Error("Phantom not connected");

  return {
    publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      transaction: T
    ) => (await phantomDeeplink.signTransaction(transaction)) as T,
    sendTransaction: async (transaction) => {
      try {
        return await phantomDeeplink.signAndSendTransaction(transaction);
      } catch {
        const signed = await phantomDeeplink.signTransaction(transaction);
        const raw =
          signed instanceof VersionedTransaction
            ? signed.serialize()
            : signed.serialize();
        return connection.sendRawTransaction(raw);
      }
    },
    signMessage: (message) => phantomDeeplink.signMessage(message),
  };
}
