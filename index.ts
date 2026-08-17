#!/usr/bin/env node
import { Command } from "commander";

import { buildConfig, ConfigError, RawOptions } from "./config";
import { startServer } from "./proxy";
import { banner, log, setColor, c } from "./logger";

const VERSION = "0.1.0";

function main(): void {
  const program = new Command();

  program
    .name("local402")
    .description("One-command local paywall for AI agents.\nDrop an x402-style HTTP 402 paywall in front of any local server or MCP tool.")
    .version(VERSION, "-v, --version", "output the version number")
    .requiredOption("-t, --target <url>", "target server to protect, e.g. http://localhost:3000")
    .option("-p, --port <number>", "port local402 listens on", "4020")
    .option("--price <string>", "price advertised in the 402 response", "0.001")
    .option("--asset <string>", "asset / currency label for the price", "USD")
    .option("--simulate", "simulated payment mode — no blockchain, instant (default)", true)
    .option("--no-simulate", "disable simulated mode (real x402 — coming soon)")
    .option("--no-color", "disable colored console output")
    .addHelpText(
      "after",
      `
Examples:
  $ local402 --target http://localhost:3000 --price 0.001
  $ local402 -t http://localhost:8787 -p 9000 --price 0.01

Once running, unpaid requests get a 402. Retry with:
  $ curl -i http://localhost:4020/ -H "x-payment: simulated"
`,
    )
    .showHelpAfterError("(add --help for usage)")
    .parse();

  const opts = program.opts<{
    target: string;
    port: string;
    price: string;
    asset: string;
    simulate: boolean;
    color: boolean;
  }>();

  if (opts.color === false) {
    setColor(false);
  }

  let cfg;
  try {
    cfg = buildConfig(opts as unknown as RawOptions);
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (!cfg.simulate) {
    log.warn(
      `real x402 settlement is not implemented yet (see roadmap). Falling back to ${c.mint("simulated")} mode.`,
    );
    cfg.simulate = true;
  }

  startServer(cfg)
    .then((server) => {
      banner(cfg);

      const shutdown = (signal: string): void => {
        log.line();
        log.info(`${c.gray(signal)} received — shutting down local402. ${c.mint("bye 🔒")}`);
        server.close(() => process.exit(0));
        // Force-exit if connections linger.
        setTimeout(() => process.exit(0), 2000).unref();
      };

      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

main();
