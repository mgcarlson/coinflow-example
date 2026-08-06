import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { CoinflowWithdraw } from "@coinflowlabs/react-native";
import {
  fetchSessionKeyForWallet,
  getSolanaConnection,
  type PhantomAuth,
  type SolanaWallet,
} from "./src/coinflowWallet";
import {
  connectPhantomMobile,
  createMwaCoinflowWallet,
  disconnectPhantomMobile,
} from "./src/mwaPhantom";
import { connectSimulatorWallet } from "./src/simulatorWallet";
import { createPubkeyWallet, parseSolanaAddress } from "./src/pubkeyWallet";
import { VenmoCheckoutScreen } from "./src/VenmoCheckoutScreen";
import { ExpoConnectionHelp } from "./src/ExpoConnectionHelp";

type AppTab = "withdraw" | "venmo";

const MERCHANT_ID =
  process.env.EXPO_PUBLIC_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const DEFAULT_USER_ID =
  process.env.EXPO_PUBLIC_COINFLOW_AUTH_USER_ID?.trim() || "demo-shopper-1";
const ENV =
  (process.env.EXPO_PUBLIC_COINFLOW_ENV?.trim() as
    | "sandbox"
    | "prod"
    | "staging"
    | undefined) || "sandbox";
const HAS_API_KEY = Boolean(
  process.env.EXPO_PUBLIC_COINFLOW_API_KEY?.trim()
);

const IS_IOS = Platform.OS === "ios";
const IS_PHYSICAL_DEVICE = Constants.isDevice;

/**
 * CoinflowWithdraw harness — Phantom on Android, simulator dev wallet on iOS.
 */
export default function App() {
  const [tab, setTab] = useState<AppTab>("venmo");
  const [phantomAuth, setPhantomAuth] = useState<PhantomAuth | null>(null);
  const [manualWallet, setManualWallet] = useState<
    (SolanaWallet & { publicKey: NonNullable<SolanaWallet["publicKey"]> }) | null
  >(null);
  const [walletAddressInput, setWalletAddressInput] = useState(
    () => process.env.EXPO_PUBLIC_COINFLOW_AUTH_WALLET?.trim() || ""
  );
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [email, setEmail] = useState("test@test.com");
  const [amountUsd, setAmountUsd] = useState("10");
  const [lockAmount, setLockAmount] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(640);

  const connection = useMemo(() => getSolanaConnection(), []);

  const wallet = useMemo(() => {
    if (IS_IOS) return manualWallet;
    if (!phantomAuth) return null;
    return createMwaCoinflowWallet(phantomAuth, connection);
  }, [manualWallet, phantomAuth, connection]);

  const walletPubkey = wallet?.publicKey.toBase58() ?? "";
  const isConnected = wallet != null;

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

  const connectWallet = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      if (IS_IOS) {
        const w = createPubkeyWallet(walletAddressInput, connection);
        setManualWallet(w);
        return;
      }
      const auth = await connectPhantomMobile(phantomAuth?.authToken);
      setPhantomAuth(auth);
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to connect wallet"
      );
    } finally {
      setConnecting(false);
    }
  }, [phantomAuth?.authToken, walletAddressInput, connection]);

  const connectSimulatorDevWallet = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const { wallet: w } = await connectSimulatorWallet();
      setManualWallet(w);
      setWalletAddressInput(w.publicKey.toBase58());
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to load dev wallet"
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    if (IS_IOS) {
      setManualWallet(null);
      setConnectError(null);
      return;
    }
    if (!phantomAuth?.authToken) {
      setPhantomAuth(null);
      return;
    }
    try {
      await disconnectPhantomMobile(phantomAuth.authToken);
    } catch {
      // Wallet may already be disconnected.
    } finally {
      setPhantomAuth(null);
      setConnectError(null);
    }
  }, [phantomAuth?.authToken]);

  const amount = parseFloat(amountUsd);
  const canRender =
    wallet != null &&
    walletPubkey.length > 0 &&
    !sessionLoading &&
    (!HAS_API_KEY || sessionKey.trim().length > 0);

  const connectLabel = IS_IOS ? "Use wallet address" : "Connect Phantom";
  const disconnectLabel = IS_IOS ? "Clear wallet" : "Disconnect Phantom";
  const walletInputValid = useMemo(() => {
    if (!IS_IOS || !walletAddressInput.trim()) return false;
    try {
      parseSolanaAddress(walletAddressInput);
      return true;
    } catch {
      return false;
    }
  }, [walletAddressInput]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Coinflow Mobile</Text>
        <Text style={styles.badge}>
          {ENV.toUpperCase()} ·{" "}
          {IS_IOS
            ? IS_PHYSICAL_DEVICE
              ? "iOS device"
              : "iOS Simulator"
            : "Android"}{" "}
          · withdraw & Venmo checkout
        </Text>

        <ExpoConnectionHelp />

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === "venmo" && styles.tabActive]}
            onPress={() => setTab("venmo")}
          >
            <Text
              style={[styles.tabText, tab === "venmo" && styles.tabTextActive]}
            >
              Venmo checkout
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === "withdraw" && styles.tabActive]}
            onPress={() => setTab("withdraw")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "withdraw" && styles.tabTextActive,
              ]}
            >
              Withdraw
            </Text>
          </Pressable>
        </View>

        {tab === "venmo" ? (
          <VenmoCheckoutScreen defaultUserId={DEFAULT_USER_ID} />
        ) : (
          <>
        {IS_IOS && !IS_PHYSICAL_DEVICE && (
          <View style={styles.callout}>
            <Text style={styles.calloutTitle}>Apple Pay will not open here</Text>
            <Text style={styles.calloutBody}>
              The iOS Simulator cannot show the Apple Pay sheet. To test Apple Pay,
              run on a physical iPhone (Wallet + a card). Instant debit in the
              withdraw WebView is not supported in the RN SDK today — use bank
              linking or test checkout Apple Pay on the web app (Vercel + domain
              whitelist).
            </Text>
          </View>
        )}
        <Text style={styles.lead}>
          {IS_IOS
            ? "Paste a Solana wallet that has a Coinflow balance (sandbox). Use simulator dev keypair if you need signing; pasted address alone cannot sign transactions."
            : "Connect Phantom, then complete KYC, bank linking, and withdraw in the embedded Coinflow UI. Requires a dev build with Phantom installed (not Expo Go)."}
        </Text>

        {IS_IOS && !isConnected && (
          <>
            <Text style={styles.label}>Solana wallet address</Text>
            <TextInput
              style={styles.input}
              value={walletAddressInput}
              onChangeText={setWalletAddressInput}
              placeholder="e.g. 7xKX… funded devnet/mainnet wallet"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {walletAddressInput.trim().length > 0 && !walletInputValid && (
              <Text style={styles.error}>Enter a valid base58 Solana address.</Text>
            )}
          </>
        )}

        {isConnected ? (
          <Pressable style={styles.btnSecondary} onPress={disconnectWallet}>
            <Text style={styles.btnSecondaryText}>{disconnectLabel}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.btnPrimary,
              (connecting || (IS_IOS && !walletInputValid)) && styles.btnDisabled,
            ]}
            onPress={connectWallet}
            disabled={connecting || (IS_IOS && !walletInputValid)}
          >
            {connecting ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.btnPrimaryText}>{connectLabel}</Text>
            )}
          </Pressable>
        )}

        {IS_IOS && !isConnected && (
          <Pressable
            style={[styles.btnSecondary, connecting && styles.btnDisabled]}
            onPress={connectSimulatorDevWallet}
            disabled={connecting}
          >
            <Text style={styles.btnSecondaryText}>Use simulator dev keypair</Text>
          </Pressable>
        )}

        {walletPubkey ? (
          <Text style={styles.fine}>Wallet: {walletPubkey}</Text>
        ) : IS_IOS ? (
          <Text style={styles.fine}>
            Paste your funded wallet address, then tap Use wallet address.
          </Text>
        ) : (
          <Text style={styles.fine}>
            Install Phantom on your Android device/emulator, then tap Connect.
          </Text>
        )}

        {connectError && <Text style={styles.error}>{connectError}</Text>}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Amount (USD)</Text>
        <TextInput
          style={styles.input}
          value={amountUsd}
          onChangeText={setAmountUsd}
          keyboardType="decimal-pad"
        />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Lock amount</Text>
          <Switch value={lockAmount} onValueChange={setLockAmount} />
        </View>

        {sessionLoading && (
          <Text style={styles.fine}>Loading session key…</Text>
        )}
        {sessionError && <Text style={styles.error}>{sessionError}</Text>}
        {lastSuccess && <Text style={styles.success}>{lastSuccess}</Text>}

        {canRender && wallet ? (
          <View style={[styles.frame, { height: frameHeight }]}>
            <CoinflowWithdraw
              wallet={wallet}
              connection={connection}
              blockchain="solana"
              merchantId={MERCHANT_ID}
              env={ENV}
              sessionKey={sessionKey.trim() || undefined}
              email={email}
              lockAmount={lockAmount}
              amount={lockAmount && !Number.isNaN(amount) ? amount : undefined}
              handleHeightChange={(h) => {
                const n = parseInt(String(h).replace(/px$/i, ""), 10);
                if (!Number.isNaN(n) && n > 0) setFrameHeight(n + 16);
              }}
              onSuccess={(args) => {
                const msg =
                  typeof args === "string"
                    ? args
                    : `paymentId: ${args.paymentId}`;
                setLastSuccess(`Withdraw success — ${msg}`);
                console.log("[CoinflowWithdraw RN] success", args);
              }}
            />
          </View>
        ) : isConnected && sessionLoading ? (
          <ActivityIndicator color="#ffe500" style={{ marginTop: 8 }} />
        ) : isConnected ? (
          <Text style={styles.fine}>Preparing withdraw UI…</Text>
        ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scroll: {
    padding: 20,
    paddingTop: 56,
  },
  title: {
    color: "#ffe500",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  badge: {
    color: "#ffe500",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 12,
  },
  lead: {
    color: "#888",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },
  callout: {
    backgroundColor: "#1a1400",
    borderWidth: 1,
    borderColor: "#ffe50055",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  calloutTitle: {
    color: "#ffe500",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  calloutBody: {
    color: "#bbb",
    fontSize: 12,
    lineHeight: 18,
  },
  btnPrimary: {
    backgroundColor: "#ffe500",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  btnPrimaryText: {
    color: "#0a0a0a",
    fontSize: 15,
    fontWeight: "700",
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  btnSecondaryText: {
    color: "#e0e0e0",
    fontSize: 15,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  label: {
    color: "#888",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 8,
    color: "#e0e0e0",
    padding: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  fine: {
    color: "#666",
    fontSize: 11,
    marginBottom: 14,
    lineHeight: 16,
  },
  error: {
    color: "#ff3d00",
    fontSize: 13,
    marginBottom: 12,
  },
  success: {
    color: "#00c853",
    fontSize: 13,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  rowLabel: {
    color: "#aaa",
    fontSize: 14,
  },
  frame: {
    minHeight: 480,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
  },
  tabActive: {
    borderColor: "#ffe500",
    backgroundColor: "#1a1400",
  },
  tabText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#ffe500",
  },
});
