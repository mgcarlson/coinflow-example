const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required for @solana-mobile/mobile-wallet-adapter-protocol/encoding (package exports).
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
