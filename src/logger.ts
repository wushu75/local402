/**
 * Tiny zero-dependency console styling for local402.
 *
 * Uses truecolor ANSI escapes so we can render the brand mint (#00ff9d)
 * exactly. Colors are enabled only on a TTY and can be turned off with
 * `--no-color`, the NO_COLOR env var, or LOCAL402_NO_COLOR.
 */

const RESET = "\x1b[0m";

let enabled =
  process.stdout.isTTY === true &&
  process.env.NO_COLOR === undefined &&
  process.env.LOCAL402_NO_COLOR === undefined;

/** Force color output on or off (used by the `--no-color` flag). */
export function setColor(on: boolean): void {
  enabled = on;
}

function wrap(open: string, close: string = RESET) {
  return (s: string | number): string => (enabled ? `${open}${s}${close}` : String(s));
}

export const c = {
  bold: wrap("\x1b[1m", "\x1b[22m"),
  dim: wrap("\x1b[2m", "\x1b[22m"),
  gray: wrap("\x1b[90m"),
  white: wrap("\x1b[97m"),
  red: wrap("\x1b[31m"),
  yellow: wrap("\x1b[33m"),
  cyan: wrap("\x1b[36m"),
  /** brand mint #00ff9d */
  mint: wrap("\x1b[38;2;0;255;157m"),
  /** brand mint background with black text — for badges */
  mintBadge: wrap("\x1b[48;2;0;255;157m\x1b[30m", RESET + ""),
};

function stamp(): string {
  // HH:MM:SS.mmm
  return c.gray(new Date().toISOString().slice(11, 23));
}

export const log = {
  line: (msg = ""): void => console.log(msg),
  info: (msg: string): void => console.log(`${stamp()} ${msg}`),
  warn: (msg: string): void => console.log(`${stamp()} ${c.yellow("warn")}  ${msg}`),
  error: (msg: string): void => console.error(`${stamp()} ${c.red("error")} ${msg}`),
};

/** Pick a status-code color for request logs. */
export function statusColor(code: number): (s: string | number) => string {
  if (code >= 500) return c.red;
  if (code === 402) return c.yellow;
  if (code >= 400) return c.yellow;
  if (code >= 300) return c.cyan;
  if (code >= 200) return c.mint;
  return c.white;
}

/**
 * Log a single request/response line, e.g.:
 *   12:00:01.234  402  GET  /v1/thing              payment required
 *   12:00:02.100  200  GET  /v1/thing   paid       proxied
 */
export function logRequest(
  method: string,
  path: string,
  status: number,
  note: string,
  paid: boolean,
): void {
  const sc = statusColor(status);
  const code = sc(c.bold(String(status)));
  const verb = c.white((method || "GET").padEnd(6));
  const badge = paid ? c.mint("paid ") : c.gray("     ");
  const route = c.white(path.length > 40 ? path.slice(0, 39) + "…" : path.padEnd(40));
  console.log(`${stamp()} ${code}  ${verb} ${badge} ${route} ${c.gray(note)}`);
}

const LOCK = "🔒";

/** Startup banner shown once the proxy is listening. */
export function banner(cfg: {
  target: string;
  port: number;
  price: string;
  asset: string;
  simulate: boolean;
}): void {
  const title = `${c.mint(c.bold("local402"))} ${LOCK}`;
  const mode = cfg.simulate
    ? c.mint("simulated")
    : c.yellow("real (unavailable — falling back to simulated)");

  log.line();
  log.line(`  ${title}  ${c.gray("— one-command local paywall for AI agents")}`);
  log.line();
  log.line(`  ${c.gray("listening")}  ${c.white(c.bold(`http://localhost:${cfg.port}`))}`);
  log.line(`  ${c.gray("target   ")}  ${c.white(cfg.target)}`);
  log.line(`  ${c.gray("price    ")}  ${c.mint(`${cfg.price} ${cfg.asset}`)} ${c.gray("per request")}`);
  log.line(`  ${c.gray("mode     ")}  ${mode}`);
  log.line();
  log.line(`  ${c.gray("unpaid →")} ${c.yellow("402 Payment Required")}`);
  log.line(`  ${c.gray("paid   →")} ${c.mint("proxied to target")}   ${c.gray("(send header:")} ${c.white("x-payment: simulated")}${c.gray(")")}`);
  log.line();
  log.line(`  ${c.dim("Ctrl+C to stop")}`);
  log.line();
}
