import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt, iterCells, rawResultName } from "../evals/lib/runner.ts";
import { loadEvaluationSpec } from "../evals/lib/spec.ts";

const root = new URL("../", import.meta.url);

test("matrix cells are stable across model, case, and repetition", async () => {
  const spec = await loadEvaluationSpec(root);
  const all = iterCells(spec, "all");
  assert.equal(all.length, spec.matrix.models.length * spec.cases.length * spec.matrix.repetitions);
  assert.equal(new Set(all.map(rawResultName)).size, all.length);
});

test("tuning and held-out tracks never overlap", async () => {
  const spec = await loadEvaluationSpec(root);
  const tuning = iterCells(spec, "tuning");
  const heldOut = iterCells(spec, "held-out");
  assert.ok(tuning.length > 0 && heldOut.length > 0);
  const tuningIds = new Set(tuning.map((cell) => cell.case.id));
  assert.equal(heldOut.some((cell) => tuningIds.has(cell.case.id)), false);
});

test("only explicit cases receive deterministic skill command", async () => {
  const spec = await loadEvaluationSpec(root);
  for (const item of spec.cases) {
    const prompt = buildPrompt(item);
    if (item.invocation === "explicit") assert.ok(prompt.startsWith("/skill:test-driven-development "));
    else assert.equal(prompt, item.task);
  }
});
