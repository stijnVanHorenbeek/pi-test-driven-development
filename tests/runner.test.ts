import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt, iterCells, rawResultName } from "../evals/lib/runner.ts";
import * as runner from "../evals/lib/runner.ts";
import { loadEvaluationSpec } from "../evals/lib/spec.ts";

const root = new URL("../", import.meta.url);

test("matrix cells are stable across model, case, and repetition", async () => {
  const spec = await loadEvaluationSpec(root);
  const all = iterCells(spec);
  assert.equal(all.length, spec.matrix.models.length * spec.cases.length * spec.matrix.repetitions);
  assert.equal(new Set(all.map(rawResultName)).size, all.length);
  assert.deepEqual(spec.matrix.models.map(({ model, thinking }) => `${model}:${thinking}`), [
    "gpt-6-luna:low", "gpt-6-luna:medium", "gpt-6-luna:high", "gpt-6-sol:medium",
  ]);
});

test("paired baselines have distinct cache names and never expand explicit skill commands", async () => {
  const spec = await loadEvaluationSpec(root);
  const paired = iterCells(spec, "both");
  const baseline = paired.filter((cell) => cell.arm === "baseline");
  assert.ok(baseline.length > 0);
  assert.ok(baseline.every((cell) => cell.case.invocation === "automatic"));
  assert.equal(new Set(paired.map(rawResultName)).size, paired.length);
});

test("cache identity ignores Git metadata but changes with evaluated content", () => {
  const key = (runner as any).contentKey;
  assert.equal(typeof key, "function");
  const content = { skillTreeSha256: "skill", evalRunnerSha256: "runner", piVersion: "1", packageCommit: "old", packageDirty: true, packageTreeSha256: "readme-old" };
  assert.equal(key(content), key({ ...content, packageCommit: "new", packageDirty: false, packageTreeSha256: "readme-new" }));
  assert.notEqual(key(content), key({ ...content, skillTreeSha256: "changed" }));
  assert.notEqual(key(content), key({ ...content, piVersion: "2" }));
});

test("diagnostic success exits zero without claiming full qualification", () => {
  const exitCode = (runner as any).reportExitCode;
  assert.equal(typeof exitCode, "function");
  assert.equal(exitCode({ diagnosticSelection: true, selectionPassed: true, qualified: false }), 0);
  assert.equal(exitCode({ diagnosticSelection: true, selectionPassed: false, qualified: false }), 1);
  assert.equal(exitCode({ diagnosticSelection: false, selectionPassed: false, qualified: true }), 0);
  assert.equal(exitCode({ diagnosticSelection: false, selectionPassed: true, qualified: false }), 1);
});

test("retry metrics retain failed attempts and their usage", () => {
  const metrics = (runner as any).attemptMetrics;
  assert.equal(typeof metrics, "function");
  const result = metrics([
    { status: "failure", response: { usage: { totalTokens: 100, costUsd: 0.1 } } },
    { status: "success", response: { usage: { totalTokens: 50, costUsd: 0.05 } } },
  ]);
  assert.equal(result.attempts, 2);
  assert.equal(result.attemptFailures, 1);
  assert.equal(result.firstAttemptSucceeded, false);
  assert.equal(result.totalTokens, 150);
  assert.ok(Math.abs(result.costUsd - 0.15) < 1e-10);
});

test("only explicit cases receive deterministic skill command", async () => {
  const spec = await loadEvaluationSpec(root);
  for (const item of spec.cases) {
    const prompt = buildPrompt(item);
    if (item.invocation === "explicit") assert.ok(prompt.startsWith("/skill:test-driven-development "));
    else assert.equal(prompt, item.task);
  }
});
