import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ref = (name: string) => readFile(new URL(`../skills/test-driven-development/references/${name}`, import.meta.url), "utf8");

test("test design rejects change detectors and permits coherent contracts", async () => {
  const text = await ref("test-design.md");
  assert.match(text, /plausible regression|name the break/i);
  assert.match(text, /table-driven/i);
  assert.match(text, /multiple related assertions/i);
  assert.match(text, /existing coverage|duplicate/i);
  assert.match(text, /public|observable/i);
});

test("UI/content guide distinguishes ordinary and contractual copy", async () => {
  const text = await ref("ui-content.md");
  assert.match(text, /ordinary copy/i);
  assert.match(text, /accessible|accessibility/i);
  assert.match(text, /legal|safety|localization/i);
  assert.match(text, /not\.toHaveTextContent\("Old label"\)/);
  assert.match(text, /getByRole/);
});

test("failure guidance rejects passing, flaky, setup, and unrelated red", async () => {
  const text = await ref("failure-modes.md");
  for (const term of ["passing", "flaky", "setup", "unrelated", "residual risk"]) assert.match(text, new RegExp(term, "i"));
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
