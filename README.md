<div align="center">

# 🔒 local402

### One-command local paywall for AI agents

Drop an HTTP **402** in front of any local server or MCP tool — so you can test
paying AI agents with no wallet, no chain, and no real money.

<br />

![local402 demo](assets/demo.gif)

<br />

```bash
npx local402 --target http://localhost:3000 --price 0.001
```

[![npm](https://img.shields.io/npm/v/local402?color=00ff9d&label=npm&logo=npm)](https://www.npmjs.com/package/local402)
[![license](https://img.shields.io/badge/license-MIT-00ff9d.svg)](./LICENSE)

**[Website](https://wushu75.github.io/local402/) · [npm](https://www.npmjs.com/package/local402) · [Report a bug](https://github.com/wushu75/local402/issues)**

</div>

---

## What is this?

`local402` drops an [x402](https://www.x402.org)-style **HTTP 402 Payment Required** paywall in front of *any* local HTTP server or MCP tool — with a single command, zero config, and no blockchain.

Requests without payment get a clean `402`. Requests that "pay" get proxied straight through to your real server. That's it.

It runs in **fully simulated mode by default**: no wallets, no gas, no external services, no waiting. Just instant, deterministic 402s you can build and test against locally.

```
agent ──▶  local402 (402 paywall)  ──▶  your server
             │
             └── no payment? → 402 Payment Required
                 paid?       → proxied response ✅
```

---

## 💸 Why local402?

Agents are learning to **pay for things** — API calls, tool invocations, data, compute. The x402 protocol makes HTTP-native payments real. But there's a gap:

> **How do you test a paying agent without spending real money, standing up a wallet, or wiring a whole payment stack — every single time?**

You don't want to deploy a facilitator and fund a testnet wallet just to check that your agent *notices* a `402` and retries with payment. You want a paywall you can throw up in one command and tear down just as fast.

That's `local402`.

| Without local402 | With local402 |
| --- | --- |
| Stand up a facilitator + wallet + testnet funds | `npx local402 --target ...` |
| Real transactions on every test run | Instant, free, deterministic |
| Blockchain latency in your test loop | 0ms — it's all local |
| Payment logic tangled into your app | One reverse proxy in front of it |
| Hard to reproduce the "unpaid" path | Guaranteed `402` on demand |

**Use it to:**

- ✅ Test that your AI agent handles `402` and retries with an `x-payment` header
- ✅ Demo a "pay-per-call" API or MCP tool without touching a chain
- ✅ Develop x402 client logic offline, on a plane, in CI
- ✅ Prototype pricing before committing to real settlement

---

## ⚡ Quick Start

You don't even need to install it.

```bash
# 1. Have any local server running (your API, MCP tool, whatever)
#    e.g. something on http://localhost:3000

# 2. Put a paywall in front of it
npx local402 --target http://localhost:3000 --price 0.001
```

local402 is now listening on **http://localhost:4020** and guarding your server.

```bash
# ❌ No payment → 402 Payment Required
curl -i http://localhost:4020/

# ✅ "Pay" → request is proxied to your real server
curl -i http://localhost:4020/ -H "x-payment: simulated"
```

Point your agent at `http://localhost:4020` instead of your real server, and watch it learn to pay. 🎉

---

## 🛠 Usage

```bash
local402 --target <url> [options]
```

| Flag | Alias | Default | Description |
| --- | --- | --- | --- |
| `--target <url>` | `-t` | *(required)* | The server to protect, e.g. `http://localhost:3000` |
| `--port <number>` | `-p` | `4020` | Port local402 listens on |
| `--price <string>` | | `0.001` | Price advertised in the `402` response |
| `--asset <string>` | | `USD` | Currency / asset label for the price |
| `--simulate` | | `true` | Simulated mode — no blockchain, instant (default) |
| `--no-simulate` | | | Reserved for real x402 settlement *(coming soon)* |
| `--no-color` | | | Disable colored console output |

### The rule

- **No `x-payment` header** → `402 Payment Required` (with a helpful JSON body + headers).
- **Has `x-payment: simulated`** *(or `paid`)* → request is proxied to `--target`, and the real response comes back untouched.

In simulated mode, **any non-empty `x-payment` value is accepted** — `simulated` and `paid` are just the canonical ones.

### Examples

```bash
# Guard an MCP tool on a custom port, charge 0.01
local402 --target http://localhost:8787 --port 9000 --price 0.01

# Free status check — always open, never paywalled
curl http://localhost:4020/__local402
```

---

## 🔍 How it works

local402 is a tiny reverse proxy with one opinion: **pay first, then pass through.**

```
                        ┌──────────────────────────────┐
                        │           local402            │
                        │        :4020 (paywall)        │
   ┌─────────┐          │                               │          ┌──────────────┐
   │  agent  │ ───────▶ │  x-payment header present?    │          │ your server  │
   │ / curl  │          │                               │          │  :3000       │
   └─────────┘          │   NO  ─▶ 402 Payment Required │          └──────────────┘
        ▲               │                               │                 ▲
        │               │   YES ─▶ proxy the request  ──┼─────────────────┘
        │               │         return real response  │                 │
        └───────────────┤◀──────────────────────────────┼─────────────────┘
              402 or proxied response                    │
                        └──────────────────────────────┘
```

**The unpaid response (`HTTP 402`):**

```jsonc
{
  "x402Version": 1,
  "error": "Payment Required",
  "message": "This resource costs 0.001 USD. Retry with header 'x-payment: simulated'.",
  "accepts": [
    {
      "scheme": "simulated",
      "network": "local",
      "maxAmountRequired": "0.001",
      "asset": "USD",
      "payTo": "local402-simulated",
      "resource": "/",
      "description": "local402 simulated paywall",
      "mimeType": "application/json"
    }
  ],
  "hint": "x-payment: simulated"
}
```

Response headers on a `402`:

```http
HTTP/1.1 402 Payment Required
x-payment-required: true
x-payment-amount: 0.001
x-payment-asset: USD
x-payment-network: local
accept-payment: x-payment: simulated
```

On a **paid** request, local402 attaches a simulated settlement receipt so your client can verify the flow end-to-end:

```http
x-payment-response: <base64 JSON receipt with a sim txHash>
```

---

## 🗺 Roadmap

local402 starts simple on purpose. The plan:

- [x] **v0.1 — Simulated mode.** Instant, local, blockchain-free `402` paywall. *(you are here)*
- [ ] **v0.2 — Real x402 settlement.** Verify actual `X-PAYMENT` payloads via a pluggable facilitator.
- [ ] **v0.3 — MCP-native mode.** First-class paywalling for MCP tools/resources, not just HTTP.
- [ ] **v0.4 — Per-route pricing.** Different prices for different paths and methods.
- [ ] **v0.5 — Usage dashboard.** Live TUI of requests, payments, and revenue.

Want to shape it? [Open an issue.](#-contributing)

---

## 🤝 Contributing

Contributions, ideas, and bug reports are all welcome — this is meant to be a friendly little tool.

```bash
git clone https://github.com/wushu75/local402.git
cd local402
npm install
npm run dev -- --target http://localhost:3000   # run from source
npm run build                                    # compile to dist/
```

1. Fork it 🍴
2. Create a branch (`git checkout -b feat/amazing-thing`)
3. Commit your changes (`git commit -m 'feat: amazing thing'`)
4. Push and open a PR

No contribution is too small — even a typo fix helps.

---

## 📄 License

[MIT](./LICENSE) © the local402 contributors. Do whatever you want with it.

---

<div align="center">

### ⭐ Star the repo if this is useful

If `local402` saved you from standing up a payment stack just to test an agent,
drop a star — it genuinely helps other people find it.

**[⭐ Star local402 on GitHub](https://github.com/wushu75/local402)**

<br />

*Built for the agents that pay their way.* 🔒

</div>
