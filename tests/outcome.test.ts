import assert from "node:assert/strict";
import test from "node:test";

import { scoreOutcome } from "../evals/lib/outcome.ts";

const expected = {
  skill_loaded: false,
  mode: "validation-only" as const,
  test_change: "forbidden" as const,
};

test("validation-only outcome passes with desired artifact, no test edit, and postcheck", () => {
  const result = scoreOutcome({
    expected,
    changedPaths: ["public/index.html"],
    diff: "+<button>Save</button>",
    postcheck: { exitCode: 0, stdout: "", stderr: "" },
    preservedWorking: {},
    observedMode: null,
  });
  assert.equal(result.artifactPassed, true);
  assert.equal(result.testChangePassed, true);
  assert.equal(result.passed, true);
});

test("artificial test, forbidden pattern, failed postcheck, or changed user work fails outcome", () => {
  const result = scoreOutcome({
    expected: { ...expected, forbidden_patterns: ["toMatchSnapshot"] },
    changedPaths: ["public/index.html", "test/button.test.js"],
    diff: "+expect(tree).toMatchSnapshot()",
    postcheck: { exitCode: 1, stdout: "", stderr: "wrong label" },
    preservedWorking: { "NOTES.md": false },
    observedMode: null,
  });
  assert.equal(result.testChangePassed, false);
  assert.equal(result.forbiddenPatternsPassed, false);
  assert.equal(result.artifactPassed, false);
  assert.equal(result.userWorkPassed, false);
  assert.equal(result.passed, false);
});

test("mode evidence is required only when observable and expected skill loaded", () => {
  const positive = scoreOutcome({
    expected: { skill_loaded: true, mode: "tdd", test_change: "required" },
    changedPaths: ["src/math.js", "test/math.test.js"],
    diff: "",
    postcheck: { exitCode: 0, stdout: "", stderr: "" },
    preservedWorking: {},
    observedMode: null,
  });
  assert.equal(positive.modePassed, null);
  assert.equal(positive.supported, false);

  const evidenced = scoreOutcome({
    expected: { skill_loaded: true, mode: "tdd", test_change: "required" },
    changedPaths: ["src/math.js", "test/math.test.js"],
    diff: "",
    postcheck: { exitCode: 0, stdout: "", stderr: "" },
    preservedWorking: {},
    observedMode: "tdd",
    observedLabel: "tdd-attested",
  });
  assert.equal(evidenced.modePassed, true);
  assert.equal(evidenced.labelPassed, true);
  assert.equal(evidenced.supported, true);
});
