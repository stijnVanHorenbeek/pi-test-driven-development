import assert from "node:assert/strict";
import test from "node:test";

import { scoreRouting } from "../evals/lib/scoring.ts";

const samples = [
  { model: "a", caseId: "p", expected: true, loaded: true, status: "success" as const },
  { model: "a", caseId: "p", expected: true, loaded: false, status: "success" as const },
  { model: "a", caseId: "n", expected: false, loaded: false, status: "success" as const },
  { model: "a", caseId: "n", expected: false, loaded: true, status: "success" as const },
  { model: "a", caseId: "missing", expected: true, loaded: false, status: "failure" as const },
];

test("reports precision, recall, confusion counts, and unresolved cells", () => {
  const score = scoreRouting(samples);
  assert.deepEqual(score.confusion, { truePositive: 1, falsePositive: 1, trueNegative: 1, falseNegative: 1 });
  assert.equal(score.precision, 0.5);
  assert.equal(score.recall, 0.5);
  assert.equal(score.unresolved, 1);
  assert.equal(score.complete, false);
});

test("does not treat failed cells as negatives", () => {
  const score = scoreRouting(samples.filter((sample) => sample.status === "failure"));
  assert.deepEqual(score.confusion, { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 });
  assert.equal(score.precision, null);
  assert.equal(score.recall, null);
});
