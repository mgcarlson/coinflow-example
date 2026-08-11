import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DepositScreen } from "./src/DepositScreen";
import { WithdrawScreen } from "./src/WithdrawScreen";

type Screen = "home" | "deposit" | "withdraw";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  if (screen === "deposit") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.screenPad}>
          <DepositScreen onBack={() => setScreen("home")} />
        </View>
      </View>
    );
  }

  if (screen === "withdraw") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.screenPad}>
          <WithdrawScreen onBack={() => setScreen("home")} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.home}>
        <Text style={styles.title}>Coinflow</Text>
        <Pressable
          style={styles.actionBtn}
          onPress={() => setScreen("deposit")}
        >
          <Text style={styles.actionBtnText}>Deposit</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={() => setScreen("withdraw")}
        >
          <Text style={styles.actionBtnText}>Withdraw</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  screenPad: {
    flex: 1,
    padding: 20,
    paddingTop: 56,
  },
  home: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    color: "#ffe500",
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 48,
  },
  actionBtn: {
    backgroundColor: "#ffe500",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 72,
    marginBottom: 16,
    width: "100%",
    maxWidth: 280,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#0a0a0a",
    fontSize: 18,
    fontWeight: "700",
  },
});
