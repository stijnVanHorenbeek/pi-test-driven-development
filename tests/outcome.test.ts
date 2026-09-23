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

test("Python unittest naming counts as a test change", () => {
  for (const path of ["test_math.py", "math_test.py"]) {
    const result = scoreOutcome({
      expected: { skill_loaded: false, mode: "tdd", test_change: "required" },
      changedPaths: ["src/math.py", path],
      diff: "",
      postcheck: { exitCode: 0, stdout: "", stderr: "" },
      preservedWorking: {},
      observedMode: null,
    });
    assert.equal(result.testChanged, true, path);
    assert.equal(result.testChangePassed, true, path);
  }
});

test("case-specific allowed paths reject one-off validation scripts", () => {
  const result = scoreOutcome({
    expected: { ...expected, allowed_changed_paths: ["package.json"] },
    changedPaths: ["package.json", "scripts/validate-package.mjs"],
    diff: "+validate package layout",
    postcheck: { exitCode: 0, stdout: "", stderr: "" },
    preservedWorking: {},
    observedMode: null,
  });
  assert.deepEqual(result.unexpectedChangedPaths, ["scripts/validate-package.mjs"]);
  assert.equal(result.allowedChangedPathsPassed, false);
  assert.equal(result.passed, false);
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

test("mixed outcomes require matching evidence for every declared scope", () => {
  const input = {
    expected: { skill_loaded: true, mode: "tdd" as const, test_change: "required" as const, scopes: [
      { name: "input validation", mode: "tdd" as const, paths: ["src/input.js"], command_pattern: "test", red_output_pattern: "input required" },
      { name: "webhook delivery", mode: "verification-limited" as const, paths: ["src/webhook.js"], command_pattern: "check" },
    ] },
    changedPaths: ["src/input.js", "test/input.test.js", "src/webhook.js"], diff: "",
    postcheck: { exitCode: 0, stdout: "", stderr: "" }, preservedWorking: {}, observedMode: null,
    scopes: [
      { name: "input validation", observedMode: "tdd" as const, observedLabel: "tdd-attested" as const },
      { name: "webhook delivery", observedMode: "verification-limited" as const, observedLabel: "verification-limited" as const },
    ],
  };
  assert.equal(scoreOutcome(input).supported, true);
  assert.equal(scoreOutcome(input).passed, true);
  assert.equal(scoreOutcome({ ...input, scopes: input.scopes.slice(0, 1) }).supported, false);
  assert.equal(scoreOutcome({ ...input, scopes: [input.scopes[0]!, { name: "webhook delivery", observedMode: "tdd", observedLabel: "tdd-attested" }] }).passed, false);
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
