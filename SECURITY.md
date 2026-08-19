# Security Policy

## Scope — please read first

`local402` is a **local development and testing tool**. It is designed to run on
`localhost`, in front of a server you control, so you can build and test the
client/agent side of an [x402](https://www.x402.org)-style payment flow.

In its current version it runs in **simulated mode**: it does **not** verify real
payments, move funds, hold keys, or touch any blockchain. A request is treated as
"paid" when it carries a non-empty `x-payment` header. That is intentional — the whole
point is to let you exercise 402-handling logic without real settlement.

**Because of this, local402 is not a security boundary and must not be used to protect
real resources or exposed to untrusted networks.** It is a test fixture, not an
authentication or payment-enforcement layer.

### Not for public exposure

Do not run local402 on a public interface or as a gateway in front of production
services. As a reverse proxy it forwards requests to whatever `--target` you give it;
running it somewhere reachable by untrusted clients would create a
[server-side request forgery](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)
and open-proxy risk. Keep it on `localhost`, in development.

## What we do test

The paywall logic is covered by an automated test suite (`npm test`) that specifically
checks the security-relevant behavior, including:

- Unpaid requests (missing, empty, or whitespace-only `x-payment`) are blocked with a
  `402` and never reach the target.
- The free status route (`/__local402`) cannot be used as a path-prefix to bypass the
  paywall.
- In strict (non-simulated) mode, only canonical payment tokens are accepted.
- Malformed input (unusual methods, oversized bodies, very long paths) does not crash
  the proxy.
- An unreachable target yields a clean `502` rather than a hang or crash.

Contributions that add adversarial test cases are very welcome.

## Reporting a vulnerability

If you find a security issue — especially anything that lets an **unpaid request reach
the target**, or that could turn local402 into an open proxy / SSRF vector — please
report it privately rather than opening a public issue:

- Preferred: use GitHub's **[private vulnerability reporting](https://github.com/wushu75/local402/security/advisories/new)**
  (Security tab → "Report a vulnerability").
- Please include a description, reproduction steps, and the impact you observed.

We aim to acknowledge reports within a few days. Since this is a small volunteer
project, please allow reasonable time for a fix before any public disclosure.

## Supported versions

This is an early-stage project (v0.x). Security fixes are applied to the latest
published version on npm. Please make sure you're on the newest release before
reporting.

Thank you for helping keep local402 honest and safe. 🔒
