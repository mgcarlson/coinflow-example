import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  buildVenmoPayPalHtml,
  fetchMerchantV2,
  fetchSessionKeyForUser,
  postPayPalCheckout,
  postVenmoCheckout,
  resolvePayPalMerchantId,
  SANDBOX_PAYPAL_CLIENT_ID,
} from "./coinflowApi";

const MERCHANT_ID =
  process.env.EXPO_PUBLIC_COINFLOW_MERCHANT_ID?.trim() || "maddie";
const USER_ID =
  process.env.EXPO_PUBLIC_COINFLOW_AUTH_USER_ID?.trim() || "demo-shopper-1";
const DEPOSIT_EMAIL =
  process.env.EXPO_PUBLIC_DEPOSIT_EMAIL?.trim() || "test@test.com";
const HAS_API_KEY = Boolean(
  process.env.EXPO_PUBLIC_COINFLOW_API_KEY?.trim()
);
const PAYPAL_CLIENT_ID =
  process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID?.trim() || SANDBOX_PAYPAL_CLIENT_ID;

function majorToCents(amount: string): number | null {
  const n = parseFloat(amount);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

type Props = {
  onBack: () => void;
};

export function DepositScreen({ onBack }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [amountUsd, setAmountUsd] = useState("10");
  const [sessionKey, setSessionKey] = useState("");
  const [paypalMerchantId, setPaypalMerchantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setupNonce, setSetupNonce] = useState(0);

  const cents = majorToCents(amountUsd);
  const ready = Boolean(sessionKey && paypalMerchantId && cents != null);

  const html = useMemo(() => {
    if (!ready || cents == null) return null;
    return buildVenmoPayPalHtml({
      paypalClientId: PAYPAL_CLIENT_ID,
      paypalMerchantId,
      cents,
    });
  }, [ready, cents, paypalMerchantId, setupNonce]);

  const prepare = useCallback(async () => {
    if (!HAS_API_KEY) {
      setError("Set EXPO_PUBLIC_COINFLOW_API_KEY in mobile/.env");
      return;
    }
    if (cents == null) {
      setSessionKey("");
      setPaypalMerchantId("");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const key = await fetchSessionKeyForUser(USER_ID);
      const merchant = await fetchMerchantV2(key);
      const { id: ppId } = resolvePayPalMerchantId(merchant);
      if (!ppId) {
        throw new Error(`No PayPal merchant id for "${MERCHANT_ID}"`);
      }
      setSessionKey(key);
      setPaypalMerchantId(ppId);
      setSetupNonce((n) => n + 1);
    } catch (e) {
      setSessionKey("");
      setPaypalMerchantId("");
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }, [cents]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void prepare();
    }, 400);
    return () => clearTimeout(timer);
  }, [prepare]);

  const handleCreateOrder = useCallback(
    async (requestId: string, funding: "paypal" | "venmo" = "venmo") => {
      if (!sessionKey || cents == null) {
        webViewRef.current?.injectJavaScript(
          `window.__onOrderResult(${JSON.stringify(requestId)}, false, "Not ready"); true;`
        );
        return;
      }
      try {
        const args = {
          merchantId: MERCHANT_ID,
          sessionKey,
          userId: USER_ID,
          subtotalCents: cents,
          email: DEPOSIT_EMAIL,
        };
        const result =
          funding === "paypal"
            ? await postPayPalCheckout(args)
            : await postVenmoCheckout(args);
        const paymentId =
          typeof result.data.paymentId === "string"
            ? result.data.paymentId
            : null;
        if (!result.ok || !paymentId) {
          const msg =
            typeof result.data.message === "string"
              ? result.data.message
              : `Checkout failed (${result.status})`;
          webViewRef.current?.injectJavaScript(
            `window.__onOrderResult(${JSON.stringify(requestId)}, false, ${JSON.stringify(msg)}); true;`
          );
          setMessage(msg);
          return;
        }
        webViewRef.current?.injectJavaScript(
          `window.__onOrderResult(${JSON.stringify(requestId)}, true, ${JSON.stringify(paymentId)}); true;`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Order failed";
        webViewRef.current?.injectJavaScript(
          `window.__onOrderResult(${JSON.stringify(requestId)}, false, ${JSON.stringify(msg)}); true;`
        );
        setMessage(msg);
      }
    },
    [sessionKey, cents]
  );

  const onWebMessage = useCallback(
    (raw: string) => {
      try {
        const msg = JSON.parse(raw) as {
          type?: string;
          requestId?: string;
          funding?: string;
          paymentId?: string;
          orderId?: string;
          message?: string;
        };
        if (msg.type === "createOrder" && msg.requestId) {
          const funding = msg.funding === "paypal" ? "paypal" : "venmo";
          void handleCreateOrder(msg.requestId, funding);
        } else if (msg.type === "approved" && msg.orderId) {
          setMessage("Payment complete");
        } else if (msg.type === "error" && msg.message) {
          setMessage(msg.message);
        } else if (msg.type === "cancelled") {
          setMessage(null);
        }
      } catch {
        // ignore
      }
    },
    [handleCreateOrder]
  );

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Deposit</Text>

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

      {error && <Text style={styles.error}>{error}</Text>}
      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.payArea}>
        {loading && (
          <ActivityIndicator color="#ffe500" style={styles.loader} />
        )}
        {html && !loading ? (
          <WebView
            ref={webViewRef}
            key={setupNonce}
            source={{ html }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            style={styles.webview}
            scrollEnabled={false}
            onMessage={(e) => onWebMessage(e.nativeEvent.data)}
            setSupportMultipleWindows
            onOpenWindow={(e) => {
              const url = e.nativeEvent.targetUrl;
              if (url) {
                webViewRef.current?.injectJavaScript(
                  `window.location.href = ${JSON.stringify(url)}; true;`
                );
              }
            }}
            onShouldStartLoadWithRequest={(req) => {
              const url = req.url;
              return (
                url === "about:blank" ||
                url.startsWith("https://") ||
                url.startsWith("http://") ||
                url.startsWith("venmo://")
              );
            }}
          />
        ) : !loading && cents == null ? (
          <Text style={styles.hint}>Enter an amount to continue</Text>
        ) : null}
      </View>
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
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
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
  payArea: {
    minHeight: 200,
  },
  webview: {
    flex: 1,
    minHeight: 200,
    backgroundColor: "transparent",
  },
  loader: { marginVertical: 24 },
  hint: { color: "#666", fontSize: 14, textAlign: "center", marginTop: 24 },
  error: { color: "#ff3d00", fontSize: 13, marginBottom: 12 },
  message: { color: "#00c853", fontSize: 13, marginBottom: 12 },
});
