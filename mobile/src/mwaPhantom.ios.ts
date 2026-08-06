import { Connection, PublicKey } from "@solana/web3.js";
import type { PhantomAuth, SolanaWallet } from "./coinflowWallet";

const ANDROID_ONLY =
  "Mobile Wallet Adapter (Phantom) is Android-only. On iOS Simulator use the simulator wallet.";

/** @see mwaPhantom.android.ts */
export async function connectPhantomMobile(): Promise<PhantomAuth> {
  throw new Error(ANDROID_ONLY);
}

export async function disconnectPhantomMobile(): Promise<void> {
  throw new Error(ANDROID_ONLY);
}

export function createMwaCoinflowWallet(): SolanaWallet & { publicKey: PublicKey } {
  throw new Error(ANDROID_ONLY);
}
