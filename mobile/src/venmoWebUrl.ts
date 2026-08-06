import Constants from "expo-constants";

/** Base URL for the Vite web app Venmo tab (Safari / Chrome — not WebView). */
export function resolveVenmoWebBaseUrl(): string {
  const fromEnv =
    process.env.EXPO_PUBLIC_VENMO_WEB_BASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_APP_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (
      Constants as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    try {
      const ip = new URL(`http://${hostUri}`).hostname;
      if (ip && ip !== "localhost") {
        return `http://${ip}:5173`;
      }
    } catch {
      const ip = hostUri.split(":")[0];
      if (ip && ip !== "localhost") {
        return `http://${ip}:5173`;
      }
    }
  }

  return "http://localhost:5173";
}

export function buildVenmoSafariUrl(args: {
  userId: string;
  email: string;
  amountUsd: string;
}): string {
  const base = resolveVenmoWebBaseUrl();
  const url = new URL("/", base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("tab", "venmo");
  url.searchParams.set("userId", args.userId.trim());
  url.searchParams.set("email", args.email.trim());
  url.searchParams.set("amount", args.amountUsd.trim());
  url.searchParams.set("auto", "1");
  return url.toString();
}
