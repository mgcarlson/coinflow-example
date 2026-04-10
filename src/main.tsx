import { createRoot } from "react-dom/client";
import { App } from "./App";

/* StrictMode disabled: Coinflow TokenEx iframes re-initialize incorrectly on dev double-mount. */
const rootEl = typeof document !== "undefined" && document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
