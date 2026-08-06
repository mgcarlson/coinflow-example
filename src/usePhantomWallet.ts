import type { SolanaWallet } from "@coinflowlabs/react";
import { PublicKey, type Connection, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSolanaConnection } from "./coinflowWallet";

/** Phantom browser extension provider (`window.phantom.solana`). */
export type PhantomProvider = {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ) => Promise<T[]>;
  signMessage: (
    message: Uint8Array,
    display?: "utf8" | "hex"
  ) => Promise<{ signature: Uint8Array }>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana ?? window.solana ?? null;
  return provider?.isPhantom ? provider : provider;
}

/** Map Phantom injected provider → Coinflow SolanaWallet. */
export function phantomToCoinflowWallet(
  provider: PhantomProvider,
  connection: Connection
): SolanaWallet & { publicKey: PublicKey } {
  if (!provider.publicKey) {
    throw new Error("Phantom is not connected");
  }

  return {
    publicKey: provider.publicKey,
    signTransaction: (tx) => provider.signTransaction(tx),
    sendTransaction: async (tx) => {
      const signed = await provider.signTransaction(tx);
      return connection.sendRawTransaction(signed.serialize());
    },
    signMessage: async (message) => {
      const { signature } = await provider.signMessage(message);
      return signature;
    },
  };
}

export function usePhantomWallet() {
  const connection = useMemo(() => getSolanaConnection(), []);
  const [provider, setProvider] = useState<PhantomProvider | null>(() =>
    getPhantomProvider()
  );
  const [publicKey, setPublicKey] = useState<PublicKey | null>(
    () => getPhantomProvider()?.publicKey ?? null
  );
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncFromProvider = useCallback((p: PhantomProvider | null) => {
    setProvider(p);
    setPublicKey(p?.publicKey ?? null);
  }, []);

  useEffect(() => {
    const p = getPhantomProvider();
    if (!p) return;

    const onConnect = () => syncFromProvider(getPhantomProvider());
    const onDisconnect = () => syncFromProvider(getPhantomProvider());
    const onAccountChanged = () => syncFromProvider(getPhantomProvider());

    p.on?.("connect", onConnect);
    p.on?.("disconnect", onDisconnect);
    p.on?.("accountChanged", onAccountChanged);

    if (p.publicKey) {
      syncFromProvider(p);
    } else {
      p.connect({ onlyIfTrusted: true }).then(onConnect).catch(() => undefined);
    }

    return () => {
      p.removeListener?.("connect", onConnect);
      p.removeListener?.("disconnect", onDisconnect);
      p.removeListener?.("accountChanged", onAccountChanged);
    };
  }, [syncFromProvider]);

  const connect = useCallback(async () => {
    const p = getPhantomProvider();
    if (!p) {
      setError("Phantom extension not found. Install it from phantom.app.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await p.connect();
      syncFromProvider(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect Phantom");
    } finally {
      setConnecting(false);
    }
  }, [syncFromProvider]);

  const disconnect = useCallback(async () => {
    const p = getPhantomProvider();
    if (!p) return;
    try {
      await p.disconnect();
    } finally {
      syncFromProvider(getPhantomProvider());
    }
  }, [syncFromProvider]);

  const coinflowWallet = useMemo(() => {
    if (!provider?.publicKey) return null;
    return phantomToCoinflowWallet(provider, connection);
  }, [provider, connection]);

  return {
    connection,
    provider,
    publicKey,
    connected: publicKey != null,
    connecting,
    error,
    connect,
    disconnect,
    coinflowWallet,
    hasPhantom: provider != null || getPhantomProvider() != null,
  };
}
