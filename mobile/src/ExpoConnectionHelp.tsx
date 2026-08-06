import Constants from "expo-constants";
import { useMemo } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onReload?: () => void;
};

/**
 * Shows how to open this project on a physical device when the Camera QR opens Safari.
 */
export function ExpoConnectionHelp({ onReload }: Props) {
  const { expoGoUrl, isDevice } = useMemo(() => {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (
        Constants as {
          manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
        }
      ).manifest2?.extra?.expoClient?.hostUri;

    let ip = "";
    if (hostUri) {
      try {
        ip = new URL(`http://${hostUri}`).hostname;
      } catch {
        ip = hostUri.split(":")[0] ?? "";
      }
    }

    const port =
      Constants.expoConfig?.packagerOpts?.port?.toString() ??
      (
        Constants.expoConfig as { metro?: { port?: number } } | undefined
      )?.metro?.port?.toString() ??
      "8081";

    const resolvedIp = ip || "YOUR_MAC_LAN_IP";
    return {
      expoGoUrl: `exp://${resolvedIp}:${port}`,
      isDevice: Constants.isDevice,
    };
  }, []);

  const openExpoGoUrl = () => {
    Linking.openURL(expoGoUrl).catch(() => {
      // Expo Go may not be registered for exp:// on all installs.
    });
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Open on your phone</Text>
      <Text style={styles.body}>
        {isDevice
          ? "Physical device detected. If the bundle fails to load, confirm Metro is running and you're on the same Wi‑Fi as your Mac."
          : "Simulator detected. For Venmo, use a physical phone with the Venmo app (US)."}
      </Text>
      <Text style={styles.steps}>
        1. Install **Expo Go** (SDK 54) from the App Store{"\n"}
        2. Run: npm run start:go (or start:tunnel if Wi‑Fi blocks LAN){"\n"}
        3. Open Expo Go → Scan QR (inside the app, not Camera){"\n"}
        4. Or paste manually:
      </Text>
      <Text style={styles.url} selectable>
        {expoGoUrl}
      </Text>
      <Text style={styles.steps}>
        Camera opens Safari? That is normal — use Expo Go's scanner or tap below.
      </Text>
      <Pressable style={styles.btn} onPress={openExpoGoUrl}>
        <Text style={styles.btnText}>Try opening in Expo Go</Text>
      </Pressable>
      {onReload ? (
        <Pressable style={styles.btnSecondary} onPress={onReload}>
          <Text style={styles.btnSecondaryText}>Reload Venmo setup</Text>
        </Pressable>
      ) : null}
      <Text style={styles.fine}>
        Dev build (recommended):{" "}
        {Platform.OS === "ios"
          ? "npx expo run:ios --device"
          : "npx expo run:android"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  title: {
    color: "#ffe500",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    color: "#aaa",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  steps: {
    color: "#888",
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 8,
  },
  url: {
    color: "#7ecbff",
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    marginBottom: 10,
  },
  fine: {
    color: "#555",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  btn: {
    backgroundColor: "#ffe500",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  btnText: {
    color: "#0a0a0a",
    fontSize: 13,
    fontWeight: "700",
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: "#ccc",
    fontSize: 13,
    fontWeight: "600",
  },
});
