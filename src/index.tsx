import "dotenv/config";
import React from "react";
import { render } from "ink";
import { App } from "./app.js";

process.on("uncaughtException", (err) => {
  console.error("[LEON] uncaught:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[LEON] unhandled rejection:", err);
  process.exit(1);
});

// Resume stdin so Windows cmd has time to attach the TTY flags before Ink mounts.
// (On cold cmd launch, process.stdin.isTTY can briefly read as undefined.)
try { process.stdin.resume(); } catch { /* ignore */ }

try {
  const { waitUntilExit } = render(<App />);
  waitUntilExit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[LEON] render error:", err);
      process.exit(1);
    });
} catch (err) {
  console.error("[LEON] failed to render:", err);
  process.exit(1);
}
