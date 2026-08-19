import { test } from "node:test";
import assert from "node:assert/strict";

import { buildConfig, ConfigError } from "../src/config";

const base = { target: "http://localhost:3000", port: "4020", price: "0.001", asset: "USD", simulate: true };

test("valid options produce a config and strip a trailing slash from target", () => {
  const cfg = buildConfig({ ...base, target: "http://localhost:3000/" });
  assert.equal(cfg.target, "http://localhost:3000");
  assert.equal(cfg.port, 4020);
  assert.equal(cfg.price, "0.001");
  assert.equal(cfg.simulate, true);
});

test("a non-URL target is rejected", () => {
  assert.throws(() => buildConfig({ ...base, target: "not a url" }), ConfigError);
});

test("a non-http(s) target protocol is rejected", () => {
  assert.throws(() => buildConfig({ ...base, target: "ftp://example.com" }), ConfigError);
  assert.throws(() => buildConfig({ ...base, target: "file:///etc/passwd" }), ConfigError);
});

test("an out-of-range port is rejected", () => {
  assert.throws(() => buildConfig({ ...base, port: "99999" }), ConfigError);
  assert.throws(() => buildConfig({ ...base, port: "0" === "0" ? "-1" : "0" }), ConfigError);
  assert.throws(() => buildConfig({ ...base, port: "not-a-number" }), ConfigError);
});

test("an empty price is rejected", () => {
  assert.throws(() => buildConfig({ ...base, price: "   " }), ConfigError);
});

test("asset falls back to USD when blank", () => {
  const cfg = buildConfig({ ...base, asset: "" });
  assert.equal(cfg.asset, "USD");
});

test("https targets are accepted", () => {
  const cfg = buildConfig({ ...base, target: "https://api.example.com" });
  assert.equal(cfg.target, "https://api.example.com");
});
