import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CoinflowWithdraw } from "@coinflowlabs/react-native";
import {
  fetchSessionKeyForWallet,
  getSolanaConnection,
  type SolanaWallet,
} from "./coinflowWallet";
import {
  connectPhantomMobile,
  createMwaCoinflowWallet,
  disconnectPhantomMobile,
} from "./mwaPhantom";
import {
  createPhantomDeeplinkWallet,
  phantomDeeplink,
} from "./phantomDeeplink";
import { connectSimulatorWallet } from "./simulatorWallet";
import type { PhantomAuth } from "./coinflowWallet";

const MERCHANT_ID =
  process.env.EXPO_PUBLIC_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const ENV =
  (process.env.EXPO_PUBLIC_COINFLOW_ENV?.trim() as
    | "sandbox"
    | "prod"
    | "staging"
    | undefined) || "sandbox";
const HAS_API_KEY = Boolean(
  process.env.EXPO_PUBLIC_COINFLOW_API_KEY?.trim()
);
const WITHDRAW_EMAIL =
  process.env.EXPO_PUBLIC_WITHDRAW_EMAIL?.trim() ||
  process.env.EXPO_PUBLIC_DEPOSIT_EMAIL?.trim() ||
  "test@test.com";

const IS_IOS = Platform.OS === "ios";
const IS_SIMULATOR = IS_IOS && !Constants.isDevice;

function majorToAmount(s: string): number | null {
  const n = parseFloat(s);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

function shortenAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

type Props = {
  onBack: () => void;
};

export function WithdrawScreen({ onBack }: Props) {
  const [wallet, setWallet] = useState<
    (SolanaWallet & { publicKey: NonNullable<SolanaWallet["publicKey"]> }) | null
  >(null);
  const [phantomAuth, setPhantomAuth] = useState<PhantomAuth | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [amountUsd, setAmountUsd] = useState("10");
  const [sessionKey, setSessionKey] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(520);

  const connection = useMemo(() => getSolanaConnection(), []);
  const walletPubkey = wallet?.publicKey.toBase58() ?? "";
  const amount = majorToAmount(amountUsd);

  useEffect(() => {
    if (IS_IOS && Constants.isDevice) {
      phantomDeeplink.start();
      return () => phantomDeeplink.stop();
    }
  }, []);

  useEffect(() => {
    if (!HAS_API_KEY || !walletPubkey) {
      setSessionKey("");
      setSessionError(null);
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    fetchSessionKeyForWallet(walletPubkey)
      .then((key) => {
        if (!cancelled) setSessionKey(key);
      })
      .catch((e) => {
        if (!cancelled) {
          setSessionKey("");
          setSessionError(
            e instanceof Error ? e.message : "Session key failed"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [walletPubkey]);

  const connectPhantom = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      if (IS_IOS) {
        const auth = await connectPhantomMobile();
        setPhantomAuth(auth);
        setWallet(createPhantomDeeplinkWallet(connection));
        return;
      }
      const auth = await connectPhantomMobile();
      setPhantomAuth(auth);
      setWallet(createMwaCoinflowWallet(auth, connection));
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to connect Phantom"
      );
    } finally {
      setConnecting(false);
    }
  }, [connection]);

  const connectSimulator = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const { wallet: w } = await connectSimulatorWallet();
      setWallet(w);
      setPhantomAuth(null);
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to load dev wallet"
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      if (phantomAuth && !IS_SIMULATOR) {
        await disconnectPhantomMobile(phantomAuth.authToken);
      }
      setPhantomAuth(null);
      setWallet(null);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setConnecting(false);
    }
  }, [phantomAuth]);

  const canRender =
    wallet != null &&
    walletPubkey.length > 0 &&
    !sessionLoading &&
    amount != null &&
    (!HAS_API_KEY || sessionKey.trim().length > 0);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Withdraw</Text>

      {!wallet ? (
        <>
          <Pressable
            style={[styles.connectBtn, connecting && styles.btnDisabled]}
            onPress={() => void connectPhantom()}
            disabled={connecting || IS_SIMULATOR}
          >
            {connecting ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.connectBtnText}>Connect Phantom</Text>
            )}
          </Pressable>
          {IS_SIMULATOR && (
            <Pressable
              style={[styles.simBtn, connecting && styles.btnDisabled]}
              onPress={() => void connectSimulator()}
              disabled={connecting}
            >
              <Text style={styles.simBtnText}>Simulator dev wallet</Text>
            </Pressable>
          )}
        </>
      ) : (
        <View style={styles.connectedRow}>
          <Text style={styles.connectedAddr}>{shortenAddress(walletPubkey)}</Text>
          <Pressable onPress={() => void disconnect()} hitSlop={8}>
            <Text style={styles.disconnect}>Disconnect</Text>
          </Pressable>
        </View>
      )}

      {connectError && <Text style={styles.error}>{connectError}</Text>}

      {wallet && (
        <>
          <View style={styles.amountRow}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={amountUsd}
              onChangeText={setAmountUsd}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#444"
            />
          </View>

          {sessionError && <Text style={styles.error}>{sessionError}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}

          {sessionLoading && (
            <ActivityIndicator color="#ffe500" style={styles.loader} />
          )}

          {canRender && (
            <View style={[styles.frame, { height: frameHeight }]}>
              <CoinflowWithdraw
                wallet={wallet}
                connection={connection}
                blockchain="solana"
                merchantId={MERCHANT_ID}
                env={ENV}
                sessionKey={sessionKey.trim() || undefined}
                email={WITHDRAW_EMAIL}
                lockAmount
                amount={amount!}
                handleHeightChange={(h) => {
                  const n = parseInt(String(h).replace(/px$/i, ""), 10);
                  if (!Number.isNaN(n) && n > 0) setFrameHeight(n + 16);
                }}
                onSuccess={(args) => {
                  const msg =
                    typeof args === "string"
                      ? args
                      : `paymentId: ${args.paymentId}`;
                  setMessage(`Withdraw complete — ${msg}`);
                }}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  back: { marginBottom: 20 },
  backText: { color: "#888", fontSize: 16 },
  title: {
    color: "#e0e0e0",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
  },
  connectBtn: {
    backgroundColor: "#ffe500",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  connectBtnText: {
    color: "#0a0a0a",
    fontSize: 16,
    fontWeight: "700",
  },
  simBtn: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  simBtnText: { color: "#aaa", fontSize: 14, fontWeight: "600" },
  btnDisabled: { opacity: 0.7 },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingVertical: 8,
  },
  connectedAddr: {
    color: "#e0e0e0",
    fontSize: 15,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  disconnect: { color: "#ffe500", fontSize: 14, fontWeight: "600" },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
    paddingBottom: 8,
  },
  currency: {
    color: "#ffe500",
    fontSize: 36,
    fontWeight: "600",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: "#e0e0e0",
    fontSize: 36,
    fontWeight: "600",
    padding: 0,
  },
  frame: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  loader: { marginBottom: 12 },
  error: { color: "#ff3d00", fontSize: 13, marginBottom: 12 },
  message: { color: "#00c853", fontSize: 13, marginBottom: 12 },
});
