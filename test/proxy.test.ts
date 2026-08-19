import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { URL } from "node:url";

import { createProxyServer } from "../src/proxy";
import { buildConfig, Local402Config } from "../src/config";

// Silence the per-request logger so test output stays readable.
before(() => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {};
});

/* ------------------------------------------------------------------ */
/* A tiny request helper built on node:http with keep-alive disabled.  */
/* Using agent:false means no pooled sockets linger, so the test        */
/* process exits cleanly on every Node version (no --test-force-exit).  */
/* ------------------------------------------------------------------ */

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: () => unknown;
}

function request(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: opts.method || "GET",
        headers: opts.headers || {},
        agent: false, // no keep-alive → no lingering sockets
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            text,
            json: () => JSON.parse(text),
          });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* Harness: a throwaway target server + a proxy in front of it.        */
/* Both listen on ephemeral ports (port 0) so tests never collide.     */
/* ------------------------------------------------------------------ */

let target: http.Server;
let proxy: http.Server;
let proxyBase: string;
let targetUrl: string;

/** A target that echoes back method, path, and body so we can assert forwarding. */
function makeTarget(): Promise<http.Server> {
  const srv = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json", "x-from-target": "yes" });
      res.end(
        JSON.stringify({
          ok: true,
          method: req.method,
          path: req.url,
          body: Buffer.concat(chunks).toString(),
        }),
      );
    });
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}

function startProxy(cfg: Local402Config): Promise<http.Server> {
  const srv = createProxyServer(cfg);
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}

function portOf(srv: http.Server): number {
  return (srv.address() as AddressInfo).port;
}

before(async () => {
  target = await makeTarget();
  targetUrl = `http://127.0.0.1:${portOf(target)}`;
  const cfg = buildConfig({ target: targetUrl, port: "4020", price: "0.001", asset: "USD", simulate: true });
  proxy = await startProxy(cfg);
  proxyBase = `http://127.0.0.1:${portOf(proxy)}`;
});

after(async () => {
  await new Promise((r) => proxy.close(r));
  await new Promise((r) => target.close(r));
});

/* ================================================================== */
/* SECURITY: the paywall must not be bypassable.                       */
/* An unpaid request must never reach the target.                      */
/* ================================================================== */

test("unpaid request (no header) is blocked with 402", async () => {
  const res = await request(`${proxyBase}/resource`);
  assert.equal(res.status, 402);
  assert.equal((res.json() as { error: string }).error, "Payment Required");
  assert.equal(res.headers["x-from-target"], undefined); // never reached target
});

test("empty x-payment header does not bypass the paywall", async () => {
  const res = await request(`${proxyBase}/resource`, { headers: { "x-payment": "" } });
  assert.equal(res.status, 402);
  assert.equal(res.headers["x-from-target"], undefined);
});

test("whitespace-only x-payment header does not bypass the paywall", async () => {
  const res = await request(`${proxyBase}/resource`, { headers: { "x-payment": "   " } });
  assert.equal(res.status, 402);
});

test("402 response carries the expected payment headers", async () => {
  const res = await request(`${proxyBase}/resource`);
  assert.equal(res.headers["x-payment-required"], "true");
  assert.equal(res.headers["x-payment-amount"], "0.001");
  assert.equal(res.headers["x-payment-asset"], "USD");
  assert.equal(res.headers["accept-payment"], "x-payment: simulated");
});

test("402 body has an x402-shaped 'accepts' block", async () => {
  const res = await request(`${proxyBase}/resource`);
  const body = res.json() as { x402Version: number; accepts: Array<{ maxAmountRequired: string; scheme: string }> };
  assert.equal(body.x402Version, 1);
  assert.ok(Array.isArray(body.accepts));
  assert.equal(body.accepts[0].maxAmountRequired, "0.001");
  assert.equal(body.accepts[0].scheme, "simulated");
});

test("the free status route cannot be used as a path-prefix bypass", async () => {
  for (const p of ["/__local402extra", "/__local402/secret", "/__local402/../resource"]) {
    const res = await request(`${proxyBase}${p}`);
    assert.equal(res.status, 402, `expected 402 for ${p}`);
  }
});

/* ================================================================== */
/* PAID: a valid payment proxies through correctly.                    */
/* ================================================================== */

test("x-payment: simulated proxies through to the target (200)", async () => {
  const res = await request(`${proxyBase}/resource`, { headers: { "x-payment": "simulated" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-from-target"], "yes");
  const body = res.json() as { ok: boolean; path: string };
  assert.equal(body.ok, true);
  assert.equal(body.path, "/resource");
});

test("x-payment: paid also proxies through (200)", async () => {
  const res = await request(`${proxyBase}/resource`, { headers: { "x-payment": "paid" } });
  assert.equal(res.status, 200);
});

test("paid response includes a settlement receipt header", async () => {
  const res = await request(`${proxyBase}/resource`, { headers: { "x-payment": "simulated" } });
  const receipt = res.headers["x-payment-response"] as string | undefined;
  assert.ok(receipt, "expected x-payment-response header");
  const decoded = JSON.parse(Buffer.from(receipt, "base64").toString());
  assert.equal(decoded.success, true);
  assert.match(decoded.txHash, /^sim_/);
});

test("POST body and method are forwarded to the target", async () => {
  const res = await request(`${proxyBase}/submit`, {
    method: "POST",
    headers: { "x-payment": "simulated", "content-type": "text/plain" },
    body: "hello-payload",
  });
  assert.equal(res.status, 200);
  const body = res.json() as { method: string; body: string };
  assert.equal(body.method, "POST");
  assert.equal(body.body, "hello-payload");
});

test("query strings are preserved through the proxy", async () => {
  const res = await request(`${proxyBase}/search?q=abc&n=2`, { headers: { "x-payment": "simulated" } });
  assert.equal((res.json() as { path: string }).path, "/search?q=abc&n=2");
});

/* ================================================================== */
/* STATUS ROUTE: always open, never proxied.                           */
/* ================================================================== */

test("status route returns 200 without any payment", async () => {
  const res = await request(`${proxyBase}/__local402`);
  assert.equal(res.status, 200);
  const body = res.json() as { name: string; status: string };
  assert.equal(body.name, "local402");
  assert.equal(body.status, "ok");
  assert.equal(res.headers["x-from-target"], undefined); // answered locally
});

test("status route ignores query strings", async () => {
  const res = await request(`${proxyBase}/__local402?foo=bar`);
  assert.equal(res.status, 200);
});

/* ================================================================== */
/* ROBUSTNESS: malformed / hostile input must not crash the proxy.     */
/* ================================================================== */

test("unusual HTTP methods are handled without crashing", async () => {
  for (const method of ["DELETE", "PATCH", "PUT", "OPTIONS"]) {
    const res = await request(`${proxyBase}/resource`, { method });
    assert.equal(res.status, 402, `unpaid ${method} should be 402`);
  }
});

test("very long paths do not crash the proxy", async () => {
  const res = await request(`${proxyBase}/${"a".repeat(4000)}`);
  assert.equal(res.status, 402);
});

test("a large paid body forwards intact", async () => {
  const big = "x".repeat(100_000);
  const res = await request(`${proxyBase}/big`, {
    method: "POST",
    headers: { "x-payment": "simulated" },
    body: big,
  });
  assert.equal((res.json() as { body: string }).body.length, 100_000);
});

test("the proxy keeps serving after a burst of mixed requests", async () => {
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      request(`${proxyBase}/r${i}`, i % 2 ? { headers: { "x-payment": "simulated" } } : {}),
    ),
  );
  const res = await request(`${proxyBase}/__local402`);
  assert.equal(res.status, 200);
});

/* ================================================================== */
/* UPSTREAM FAILURE: unreachable target returns a clean 502.           */
/* ================================================================== */

test("a paid request to an unreachable target returns 502, not a crash", async () => {
  const cfg = buildConfig({ target: "http://127.0.0.1:1", port: "4020", price: "0.001", asset: "USD", simulate: true });
  const p = await startProxy(cfg);
  const base = `http://127.0.0.1:${portOf(p)}`;
  try {
    const res = await request(`${base}/x`, { headers: { "x-payment": "simulated" } });
    assert.equal(res.status, 502);
    assert.equal((res.json() as { error: string }).error, "Bad Gateway");
  } finally {
    await new Promise((r) => p.close(r));
  }
});

/* ================================================================== */
/* STRICT (non-simulate) MODE: only canonical tokens are accepted.     */
/* ================================================================== */

test("in non-simulate mode, arbitrary tokens are rejected but canonical ones pass", async () => {
  const cfg = buildConfig({ target: targetUrl, port: "4020", price: "0.001", asset: "USD", simulate: false });
  const p = await startProxy(cfg);
  const base = `http://127.0.0.1:${portOf(p)}`;
  try {
    const bogus = await request(`${base}/r`, { headers: { "x-payment": "definitely-not-valid" } });
    assert.equal(bogus.status, 402, "arbitrary token must not pass in strict mode");

    const ok = await request(`${base}/r`, { headers: { "x-payment": "paid" } });
    assert.equal(ok.status, 200, "canonical token should pass");
  } finally {
    await new Promise((r) => p.close(r));
  }
});
