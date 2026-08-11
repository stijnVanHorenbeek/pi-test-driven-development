import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readme = new URL("../README.md", import.meta.url);

test("README documents routing, tools, lifecycle, provenance, and evaluation limits", async () => {
  const text = await readFile(readme, "utf8");
  for (const concept of [
    "Automatic activation",
    "/skill:test-driven-development",
    "test_context",
    "test_policy",
    "test_run",
    "test_status",
    "pi config",
    "pi remove",
    "obra/superpowers",
    "44c9b2d6e889982ac18c27d05a19fefe335194e1",
    "held-out",
    "model-dependent",
  ]) assert.ok(text.includes(concept), concept);
  assert.match(text, /cannot|does not.*prove/i);
});
