import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ref = (name: string) => readFile(new URL(`../skills/test-driven-development/references/${name}`, import.meta.url), "utf8");

test("failure guidance rejects passing, flaky, setup, and unrelated red", async () => {
  const text = await ref("failure-modes.md");
  for (const term of ["passing", "flaky", "setup", "unrelated", "residual risk"]) assert.match(text, new RegExp(term, "i"));
  assert.match(text, /built-in.*`read`|`bash`/i);
  assert.doesNotMatch(text, /test_(?:context|run|status)/);
});

test("refactor and regression references preserve existing work", async () => {
  const refactor = await ref("refactoring.md");
  const regression = await ref("regression-evaluation.md");
  assert.match(refactor, /green baseline/i);
  assert.match(refactor, /no artificial red|do not.*red/i);
  assert.match(regression, /preserve/i);
  assert.match(regression, /not TDD|do not claim TDD/i);
  assert.match(regression, /never|do not.*revert|delete/i);
});
