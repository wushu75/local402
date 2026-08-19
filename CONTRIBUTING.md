# Contributing to local402

Thanks for taking a look — contributions, ideas, and bug reports are all genuinely
welcome. local402 is meant to be a small, friendly tool, so no contribution is too
minor. A typo fix counts.

## Ways to help

- **Found a bug?** [Open an issue](https://github.com/wushu75/local402/issues/new)
  with what you ran, what you expected, and what happened.
- **Have an idea?** Open an issue and describe the use case — the "why" matters more
  than the "how".
- **Want to write code?** Check the
  [`good first issue`](https://github.com/wushu75/local402/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  label for scoped, beginner-friendly tasks.

## Development setup

You'll need **Node.js 18 or newer**.

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/local402.git
cd local402

# 2. Install dependencies
npm install

# 3. Run it from source (no build step needed, thanks to tsx)
npm run dev -- --target http://localhost:3000 --price 0.001

# 4. Type-check / compile to dist/ when you're ready
npm run build
```

### Trying your changes end to end

Spin up any local server to proxy to, then point local402 at it:

```bash
# a throwaway target on :3000
node -e "require('http').createServer((_,res)=>{res.end('{\"ok\":true}')}).listen(3000)"

# in another terminal, run local402 from source
npm run dev -- --target http://localhost:3000

# then, in a third terminal:
curl -i http://localhost:4020/                          # → 402 Payment Required
curl -i http://localhost:4020/ -H "x-payment: simulated" # → proxied 200
```

## Project layout

```
src/
  index.ts    CLI entry point (commander flags, wiring, shutdown)
  config.ts   option parsing + validation, shared types
  proxy.ts    the 402 paywall + reverse-proxy logic
  logger.ts   zero-dependency colored console output
```

Keep the dependency footprint small — local402's whole appeal is that it's tiny and
runs with `npx`. Please don't add a runtime dependency without opening an issue to
discuss it first.

## Sending a pull request

1. Create a branch: `git checkout -b feat/short-description`
2. Make your change. Keep it focused — one logical change per PR is easiest to review.
3. Run `npm run build` and confirm it compiles with no errors.
4. Give it a quick manual test using the steps above.
5. Commit with a clear message (e.g. `feat: add --quiet flag`, `fix: handle trailing slash in target`).
6. Push to your fork and open a PR against `main`, describing what you changed and why.

### Commit message style

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/) —
prefixes like `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` are appreciated but
not required. Clarity beats ceremony.

## Coding notes

- TypeScript, `strict` mode is on — please keep it type-clean.
- Match the existing style (2-space indent, no semicolon gymnastics — just follow
  what's already there).
- Prefer the Node standard library over new dependencies wherever it's reasonable.
- If you're touching the 402 response shape, keep it loosely aligned with the
  [x402](https://www.x402.org) spec so it stays useful for real clients.

## Code of conduct

Be kind and constructive. Assume good faith, keep feedback about the code, and help
newcomers feel welcome. That's the whole policy.

## Questions?

Not sure where to start, or want to sanity-check an idea before building it? Open an
issue and ask — happy to help you find something to work on.

Thanks again 🔒
