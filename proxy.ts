import http from "node:http";
import https from "node:https";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";

import { Local402Config, STATUS_PATH } from "./config";
import { log, logRequest } from "./logger";

/**
 * Decide whether an incoming request counts as "paid".
 *
 * - In simulated mode, any non-empty `x-payment` header is accepted
 *   (`simulated` and `paid` are the canonical tokens).
 * - Otherwise (real mode — not yet implemented), only explicit canonical
 *   tokens are accepted so behavior is predictable.
 */
function isPaid(header: string | string[] | undefined, simulate: boolean): boolean {
  if (!header) return false;
  const value = (Array.isArray(header) ? header[0] : header).trim().toLowerCase();
  if (value.length === 0) return false;
  if (simulate) return true;
  return value === "simulated" || value === "paid";
}

/** Build the JSON body returned on a 402, loosely modeled on x402. */
function paymentRequiredBody(cfg: Local402Config, resource: string) {
  return {
    x402Version: 1,
    error: "Payment Required",
    message: `This resource costs ${cfg.price} ${cfg.asset}. Retry with header 'x-payment: simulated'.`,
    accepts: [
      {
        scheme: cfg.simulate ? "simulated" : "exact",
        network: cfg.network,
        maxAmountRequired: cfg.price,
        asset: cfg.asset,
        payTo: cfg.payTo,
        resource,
        description: "local402 simulated paywall",
        mimeType: "application/json",
      },
    ],
    hint: "x-payment: simulated",
  };
}

/** A base64-encoded simulated settlement receipt for the `x-payment-response` header. */
function settlementReceipt(cfg: Local402Config, token: string): string {
  const receipt = {
    success: true,
    scheme: cfg.simulate ? "simulated" : "exact",
    network: cfg.network,
    amount: cfg.price,
    asset: cfg.asset,
    payer: "local402-agent",
    payTo: cfg.payTo,
    txHash: `sim_${randomBytes(16).toString("hex")}`,
    token,
    settledAt: new Date().toISOString(),
  };
  return Buffer.from(JSON.stringify(receipt)).toString("base64");
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, extraHeaders: http.OutgoingHttpHeaders = {}): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "x-powered-by": "local402",
    ...extraHeaders,
  });
  res.end(payload);
}

/** Join the target's base path with the incoming request path. */
function joinPath(basePath: string, reqUrl: string): string {
  if (!basePath || basePath === "/") return reqUrl;
  return basePath.replace(/\/$/, "") + reqUrl;
}

/** Forward a paid request to the target and stream the response back. */
function forward(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: Local402Config,
  target: URL,
  token: string,
): void {
  const client = target.protocol === "https:" ? https : http;
  const method = req.method || "GET";
  const path = joinPath(target.pathname, req.url || "/");

  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  headers.host = target.host;

  const options: http.RequestOptions = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    method,
    path,
    headers,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    const outHeaders: http.OutgoingHttpHeaders = { ...proxyRes.headers };
    outHeaders["x-payment-response"] = settlementReceipt(cfg, token);
    outHeaders["x-powered-by"] = "local402";
    res.writeHead(proxyRes.statusCode || 502, outHeaders);
    proxyRes.pipe(res);
    logRequest(method, req.url || "/", proxyRes.statusCode || 502, "proxied", true);
  });

  proxyReq.on("error", (err) => {
    logRequest(method, req.url || "/", 502, `upstream error: ${err.message}`, true);
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: "Bad Gateway",
        message: `local402 could not reach target ${cfg.target}`,
        detail: err.message,
      });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

/** Create the paywall proxy server (not yet listening). */
export function createProxyServer(cfg: Local402Config): http.Server {
  const target = new URL(cfg.target);

  return http.createServer((req, res) => {
    const method = req.method || "GET";
    const resource = req.url || "/";

    // Always-open status endpoint — never paywalled.
    if (resource.split("?")[0] === STATUS_PATH) {
      logRequest(method, resource, 200, "status (free)", false);
      sendJson(res, 200, {
        name: "local402",
        status: "ok",
        mode: cfg.simulate ? "simulated" : "real",
        target: cfg.target,
        price: cfg.price,
        asset: cfg.asset,
        hint: "Send 'x-payment: simulated' to pass through the paywall.",
      });
      return;
    }

    const paymentHeader = req.headers["x-payment"];

    if (!isPaid(paymentHeader, cfg.simulate)) {
      logRequest(method, resource, 402, "payment required", false);
      sendJson(res, 402, paymentRequiredBody(cfg, resource), {
        "x-payment-required": "true",
        "x-payment-amount": cfg.price,
        "x-payment-asset": cfg.asset,
        "x-payment-network": cfg.network,
        "accept-payment": "x-payment: simulated",
      });
      return;
    }

    const token = (Array.isArray(paymentHeader) ? paymentHeader[0] : paymentHeader) || "simulated";
    forward(req, res, cfg, target, token);
  });
}

/** Start listening and print the banner. Resolves once the server is up. */
export function startServer(cfg: Local402Config): Promise<http.Server> {
  const server = createProxyServer(cfg);

  return new Promise((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        log.error(`port ${cfg.port} is already in use. Try a different --port.`);
      } else {
        log.error(`failed to start: ${err.message}`);
      }
      reject(err);
    });

    server.listen(cfg.port, () => resolve(server));
  });
}
