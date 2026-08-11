import Constants from "expo-constants";
import {
  createPhantomDeeplinkWallet,
  phantomDeeplink,
} from "./phantomDeeplink";
import type { PhantomAuth, SolanaWallet } from "./coinflowWallet";
import { Connection, PublicKey } from "@solana/web3.js";

const SIMULATOR_ONLY =
  "Install Phantom on a physical iPhone, or use the simulator dev wallet.";

/** Connect to Phantom on iOS via deeplinks (physical device). */
export async function connectPhantomMobile(): Promise<PhantomAuth> {
  if (!Constants.isDevice) {
    throw new Error(SIMULATOR_ONLY);
  }
  phantomDeeplink.start();
  return phantomDeeplink.connect();
}

export async function disconnectPhantomMobile(_authToken?: string): Promise<void> {
  await phantomDeeplink.disconnect();
}

export function createMwaCoinflowWallet(
  _auth: PhantomAuth,
  connection: Connection
): SolanaWallet & { publicKey: PublicKey } {
  return createPhantomDeeplinkWallet(connection);
}
