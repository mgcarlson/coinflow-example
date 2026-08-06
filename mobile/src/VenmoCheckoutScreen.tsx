import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ExpoConnectionHelp } from "./ExpoConnectionHelp";
import {
  buildVenmoSafariUrl,
  resolveVenmoWebBaseUrl,
} from "./venmoWebUrl";

const HAS_API_KEY = Boolean(
  process.env.EXPO_PUBLIC_COINFLOW_API_KEY?.trim()
);

function majorToCents(amount: string): number | null {
  const n = parseFloat(amount);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

type Props = {
  defaultUserId: string;
};

export function VenmoCheckoutScreen({ defaultUserId }: Props) {
  const [userId, setUserId] = useState(defaultUserId);
  const [email, setEmail] = useState("test@test.com");
  const [amountUsd, setAmountUsd] = useState("5.00");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = majorToCents(amountUsd);
  const webBase = resolveVenmoWebBaseUrl();

  const openInBrowser = useCallback(async () => {
    if (!HAS_API_KEY) {
      setError("Set EXPO_PUBLIC_COINFLOW_API_KEY in mobile/.env");
      return;
    }
    if (!userId.trim()) {
      setError("Shopper user id is required");
      return;
    }
    if (cents == null) {
      setError("Enter a valid amount");
      return;
    }
    if (!email.trim()) {
      setError("Email is required for Venmo checkout");
      return;
    }

    setOpening(true);
    setError(null);
    try {
      const url = buildVenmoSafariUrl({
        userId: userId.trim(),
        email: email.trim(),
        amountUsd,
      });
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        throw new Error(`Cannot open ${url}`);
      }
      await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open browser");
    } finally {
      setOpening(false);
    }
  }, [userId, email, amountUsd, cents]);

  return (
    <View style={styles.wrap}>
      <View style={styles.callout}>
        <Text style={styles.calloutTitle}>Venmo requires Safari or Chrome</Text>
        <Text style={styles.calloutBody}>
          PayPal blocks Venmo inside React Native WebViews — even with the Venmo
          app installed and a US account,{" "}
          <Text style={styles.em}>buttons.isEligible()</Text> returns false in
          the app. Open checkout in{" "}
          {Platform.OS === "ios" ? "Safari" : "Chrome"} instead (same Wi‑Fi as
          your Mac running <Text style={styles.mono}>npm run dev</Text>).
        </Text>
      </View>

      <ExpoConnectionHelp />

      {!HAS_API_KEY && (
        <Text style={styles.error}>Set EXPO_PUBLIC_COINFLOW_API_KEY</Text>
      )}

      <Text style={styles.label}>Shopper user id</Text>
      <TextInput
        style={styles.input}
        value={userId}
        onChangeText={setUserId}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Venmo email</Text>
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

      <Pressable
        style={[styles.primaryBtn, opening && styles.btnDisabled]}
        onPress={() => void openInBrowser()}
        disabled={opening}
      >
        <Text style={styles.primaryBtnText}>
          {opening
            ? "Opening…"
            : `Continue in ${Platform.OS === "ios" ? "Safari" : "Chrome"}`}
        </Text>
      </Pressable>

      <Text style={styles.fine} selectable>
        Web app: {webBase}
        {"\n"}
        Override with EXPO_PUBLIC_VENMO_WEB_BASE_URL (tunnel or Vercel HTTPS).
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {opening && (
        <ActivityIndicator color="#ffe500" style={{ marginTop: 12 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  callout: {
    backgroundColor: "#1a1500",
    borderWidth: 1,
    borderColor: "#443800",
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
  em: { fontStyle: "italic", color: "#ddd" },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    color: "#ccc",
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
  primaryBtn: {
    backgroundColor: "#ffe500",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    color: "#0a0a0a",
    fontSize: 15,
    fontWeight: "700",
  },
  fine: {
    color: "#666",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  error: {
    color: "#ff3d00",
    fontSize: 13,
    marginBottom: 12,
  },
});
