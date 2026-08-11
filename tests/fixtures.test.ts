import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFixtureRepository } from "../evals/lib/fixtures.ts";
import { loadEvaluationSpec } from "../evals/lib/spec.ts";

const root = new URL("../", import.meta.url);

test("creates committed baseline then applies working files as dirty user work", async () => {
  const spec = await loadEvaluationSpec(root);
  const item = spec.cases.find((value) => value.id === "dirty-tree-bug");
  assert.ok(item);
  const fixture = await createFixtureRepository(item, spec.templates[item.template]);
  assert.match(fixture.statusBefore, /NOTES\.md/);
  assert.equal(await readFile(new URL("NOTES.md", fixture.url), "utf8"), "User draft: keep this exact line.\n");
  assert.ok(fixture.preservedWorkingHashes["NOTES.md"]);
  await fixture.cleanup();
});

test("base overlay is committed and not mistaken for incoming work", async () => {
  const spec = await loadEvaluationSpec(root);
  const item = spec.cases.find((value) => value.id === "reproducible-bug");
  assert.ok(item);
  const fixture = await createFixtureRepository(item, spec.templates[item.template]);
  assert.equal(fixture.statusBefore, "");
  assert.match(await readFile(new URL("src/math.js", fixture.url), "utf8"), /divide/);
  await fixture.cleanup();
});
