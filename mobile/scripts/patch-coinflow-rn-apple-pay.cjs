/**
 * @coinflowlabs/react-native only sets WebView enableApplePay for /purchase/ routes.
 * We also enable /apple-pay/ (CoinflowApplePayButton). We intentionally skip /withdraw/:
 * react-native-webview blocks injectJavaScript when enableApplePay is on, which breaks
 * Coinflow's wallet postMessage bridge (signing) required by withdraw.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "../node_modules/@coinflowlabs/react-native/build/CoinflowWebView.js"
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const marker = "coinflow-example: enableApplePay withdraw";
let source = fs.readFileSync(target, "utf8");

const oldLine =
  "var enableApplePay = props.route.includes('/purchase/') && Platform.OS === 'ios';";

const newLine = `// ${marker}
        var enableApplePay = Platform.OS === 'ios' && (props.route.includes('/purchase/') || props.route.includes('/apple-pay/'));`;

const legacyPatchedLine = `// ${marker}
        var enableApplePay = Platform.OS === 'ios' && (props.route.includes('/purchase/') || props.route.includes('/withdraw/') || props.route.includes('/apple-pay/'));`;

if (source.includes(newLine)) {
  process.exit(0);
}

if (source.includes(legacyPatchedLine)) {
  source = source.replace(legacyPatchedLine, newLine);
  fs.writeFileSync(target, source);
  console.log(
    "[patch-coinflow-rn-apple-pay] removed withdraw from enableApplePay (fixes WebView bridge)"
  );
  process.exit(0);
}

if (!source.includes(oldLine)) {
  console.warn(
    "[patch-coinflow-rn-apple-pay] CoinflowWebView.js changed; skip patch"
  );
  process.exit(0);
}

source = source.replace(oldLine, newLine);
fs.writeFileSync(target, source);
console.log("[patch-coinflow-rn-apple-pay] enabled Apple Pay for purchase + apple-pay routes");
