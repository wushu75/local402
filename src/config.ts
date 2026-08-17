import { URL } from "node:url";

export interface Local402Config {
  /** Absolute URL of the server being protected, e.g. http://localhost:3000 */
  target: string;
  /** Port local402 listens on. */
  port: number;
  /** Price advertised in the 402 response body/headers. */
  price: string;
  /** Asset/currency label for the price (e.g. "USD"). */
  asset: string;
  /** Simulated mode — no blockchain, instant. */
  simulate: boolean;
  /** Network label used in the x402-style payment requirements. */
  network: string;
  /** payTo label used in the x402-style payment requirements. */
  payTo: string;
}

export interface RawOptions {
  target: string;
  port: string;
  price: string;
  asset: string;
  simulate: boolean;
}

export class ConfigError extends Error {}

/** Path that is always reachable without payment — a free status endpoint. */
export const STATUS_PATH = "/__local402";

/** Canonical payment tokens. In simulated mode any non-empty value is accepted. */
export const CANONICAL_TOKENS = ["simulated", "paid"] as const;

/**
 * Validate raw CLI options and produce a typed config.
 * Throws ConfigError with a friendly message on invalid input.
 */
export function buildConfig(opts: RawOptions): Local402Config {
  let target: URL;
  try {
    target = new URL(opts.target);
  } catch {
    throw new ConfigError(
      `invalid --target "${opts.target}". Expected a full URL like http://localhost:3000`,
    );
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new ConfigError(
      `unsupported --target protocol "${target.protocol}". Only http and https are supported.`,
    );
  }

  const port = Number.parseInt(opts.port, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`invalid --port "${opts.port}". Expected a number between 1 and 65535.`);
  }

  const price = String(opts.price).trim();
  if (price.length === 0) {
    throw new ConfigError(`invalid --price. Expected a non-empty value like "0.001".`);
  }

  return {
    target: target.toString().replace(/\/$/, ""),
    port,
    price,
    asset: String(opts.asset || "USD").trim() || "USD",
    simulate: opts.simulate,
    network: "local",
    payTo: "local402-simulated",
  };
}
