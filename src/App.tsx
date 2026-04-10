import type { CSSProperties } from "react";
import { CoinflowPurchaseTest } from "./CoinflowPurchaseTest";

export function App() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Coinflow Purchase</h1>
      <p style={styles.badge}>SANDBOX · MXN presentment</p>
      <div style={styles.card}>
        <CoinflowPurchaseTest />
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#e0e0e0",
    fontFamily: "'Inter', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 20px",
  },
  title: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "1.6rem",
    color: "#ffe500",
    marginBottom: 4,
  },
  badge: {
    fontSize: "0.7rem",
    padding: "3px 8px",
    borderRadius: 4,
    background: "rgba(255,229,0,0.15)",
    color: "#ffe500",
    fontWeight: 600,
    letterSpacing: 1,
    marginBottom: 32,
  },
  card: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    padding: 32,
    width: "100%",
    maxWidth: 560,
  },
};
