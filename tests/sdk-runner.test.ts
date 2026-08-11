import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { aggregateResults, createIsolatedAgentDir, inferObservedWorkflow } from "../evals/lib/sdk-runner.ts";

const acceptance = {
  automatic_positive_load_minimum_per_three: 2,
  automatic_negative_load_maximum_per_three: 0,
  explicit_load_minimum_per_three: 3,
  workflow_outcome_minimum_per_three: 2,
  user_work_preservation_required: true,
  unsupported_or_missing_cells_block_complete_claim: true,
};

test("isolated Pi directory copies only auth and model catalog material", async () => {
  const source = await mkdtemp(join(tmpdir(), "pi-source-"));
  await mkdir(join(source, "extensions"));
  await writeFile(join(source, "auth.json"), '{"x":1}');
  await writeFile(join(source, "models-store.json"), '{"y":2}');
  await writeFile(join(source, "settings.json"), '{"packages":["ambient"]}');
  const isolated = await createIsolatedAgentDir(source);
  assert.equal(await readFile(join(isolated.path, "auth.json"), "utf8"), '{"x":1}');
  assert.equal(await readFile(join(isolated.path, "models-store.json"), "utf8"), '{"y":2}');
  await assert.rejects(() => readFile(join(isolated.path, "settings.json")));
  await assert.rejects(() => readFile(join(isolated.path, "extensions", "anything")));
  await isolated.cleanup();
});

test("infers TDD only from behavior-specific, causally ordered built-in evidence", () => {
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: "multiply is not exported\nCommand exited with code 1" },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "npm test" }, resultText: "pass" },
  ];
  assert.deepEqual(inferObservedWorkflow(timeline, "Evidence: tdd-attested", "multiply"), {
    claimedLabel: "tdd-attested",
    observedMode: "tdd",
    observedLabel: "tdd-attested",
  });
  for (const invalid of [
    timeline.map((entry) => entry.sequence === 3 ? { ...entry, resultText: "Error: Cannot find module multiply\nCommand exited with code 1" } : entry),
    timeline.map((entry) => entry.sequence === 3 ? { ...entry, resultText: "pre-existing unrelated failure\nCommand exited with code 1" } : entry),
    timeline.map((entry) => entry.sequence === 3 ? { ...entry, resultText: "✔ multiply works\n✖ pre-existing unrelated failure\nCommand exited with code 1" } : entry),
    timeline.map((entry) => entry.sequence === 3 ? { ...entry, args: { command: "npm test $(node mutate.js)" } } : entry),
    timeline.map((entry) => entry.sequence === 3 ? { ...entry, args: { command: "npm test \"$(node mutate.js)\"" } } : entry),
    timeline.map((entry) => entry.sequence === 3 ? { ...entry, completionSequence: 6 } : entry),
    [
      ...timeline.slice(0, 2),
      { ...timeline[2], completionSequence: 9 },
      { sequence: 6, completionSequence: 7, toolName: "edit", args: { path: "src/other.js" }, resultText: "ok" },
      { ...timeline[3], sequence: 8, completionSequence: 10 },
    ],
    [
      { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "src/early.js" }, resultText: "ok" },
      ...timeline.map((entry) => ({ ...entry, sequence: entry.sequence + 2, completionSequence: entry.completionSequence + 2 })),
    ],
    timeline.map((entry) => entry.sequence === 5 ? { ...entry, completionSequence: undefined } : entry),
    ...["rm src/other.js", "python mutate.py", "node mutate.js", "echo $(node mutate.js)"].map((command) => [
      ...timeline,
      { sequence: 9, completionSequence: 10, toolName: "bash", args: { command }, resultText: "" },
    ]),
  ]) {
    assert.equal(inferObservedWorkflow(invalid, "Evidence: tdd-attested", "multiply").observedLabel, null);
  }
});

test("recognizes common language-native test paths", () => {
  for (const [path, command] of [
    ["math_test.go", "go test ./..."],
    ["test_math.py", "pytest"],
    ["tests/test_math.py", "python3 -m unittest"],
  ]) {
    const timeline = [
      { sequence: 1, completionSequence: 2, toolName: "edit", args: { path }, resultText: "ok" },
      { sequence: 3, completionSequence: 4, toolName: "bash", args: { command }, resultText: "multiply missing\nCommand exited with code 1" },
      { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "math.go" }, resultText: "ok" },
      { sequence: 7, completionSequence: 8, toolName: "bash", args: { command }, resultText: "pass" },
    ];
    assert.equal(inferObservedWorkflow(timeline, "Evidence: tdd-attested", "multiply").observedLabel, "tdd-attested");
  }
});

test("validates preservation, regression, validation, and limited claims from built-ins", () => {
  assert.equal(inferObservedWorkflow([
    { sequence: 1, completionSequence: 2, toolName: "bash", args: { command: "npm test" }, resultText: "pass" },
    { sequence: 3, completionSequence: 4, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 5, completionSequence: 6, toolName: "bash", args: { command: "npm test" }, resultText: "pass" },
  ], "Evidence: preservation-verified").observedLabel, "preservation-verified");

  const regression = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: "pass" },
  ];
  assert.equal(inferObservedWorkflow(regression, "Evidence: regression-verified").observedLabel, "regression-verified");
  for (const invalid of [
    regression.map((entry) => entry.sequence === 3 ? { ...entry, args: { command: "npm test || true" } } : entry),
    regression.map((entry) => entry.sequence === 3 ? { ...entry, args: { command: "echo npm test" } } : entry),
    [{ sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" }, ...regression.map((entry) => ({ ...entry, sequence: entry.sequence + 2, completionSequence: entry.completionSequence + 2 }))],
  ]) {
    assert.equal(inferObservedWorkflow(invalid, "Evidence: regression-verified").observedLabel, null);
  }

  const validationMutation = { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "src/config.js" }, resultText: "ok" };
  assert.equal(inferObservedWorkflow([
    validationMutation,
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "git diff --check" }, resultText: "" },
  ], "Evidence: validation-only").observedLabel, "validation-only");
  assert.equal(inferObservedWorkflow([
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "package.json" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm pack --dry-run --json" }, resultText: "[]" },
  ], "Evidence: validation-only").observedLabel, "validation-only");
  assert.equal(inferObservedWorkflow([
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "go.mod" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "go mod edit -json" }, resultText: "{}" },
  ], "Evidence: validation-only").observedLabel, "validation-only");
  assert.equal(inferObservedWorkflow([
    { sequence: 1, completionSequence: 2, toolName: "bash", args: { command: "go mod edit -go=1.23" }, resultText: "" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "go list -m -f '{{.GoVersion}}'" }, resultText: "1.23" },
  ], "Evidence: validation-only").observedLabel, "validation-only");
  assert.equal(inferObservedWorkflow([
    validationMutation,
    { sequence: 3, completionSequence: 4, toolName: "read", args: { path: "src/config.js" }, resultText: "updated" },
  ], "Evidence: validation-only").observedLabel, "validation-only");
  for (const irrelevant of [
    { sequence: 3, completionSequence: 4, toolName: "read", args: { path: "README.md" }, resultText: "docs" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "pwd" }, resultText: "/repo" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm pack --json" }, resultText: "{}" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm pack --dry-run --json\nnpm pack" }, resultText: "{}" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm pack --dry-run --json & npm pack" }, resultText: "{}" },
  ]) {
    assert.equal(inferObservedWorkflow([validationMutation, irrelevant], "Evidence: validation-only").observedLabel, null);
  }

  assert.equal(inferObservedWorkflow([], "Automation unavailable. Evidence: verification-limited").observedLabel, null);
  assert.deepEqual(inferObservedWorkflow([
    validationMutation,
    { sequence: 3, completionSequence: 4, toolName: "read", args: { path: "src/config.js" }, resultText: "updated" },
  ], "Automation unavailable. Residual risk remains. Evidence: verification-limited"), {
    claimedLabel: "verification-limited",
    observedMode: "verification-limited",
    observedLabel: "verification-limited",
  });
  for (const text of ["Looks good", "Possible labels: tdd-attested or validation-only."]) {
    assert.deepEqual(inferObservedWorkflow([], text), {
      claimedLabel: null,
      observedMode: null,
      observedLabel: null,
    });
  }
});

test("aggregation keeps failures and unsupported outcomes visible", () => {
  const report = aggregateResults([
    { status: "success", model: "m", caseId: "p", invocation: "automatic", expectedLoaded: true, loaded: true, outcomePassed: true, outcomeSupported: true },
    { status: "success", model: "m", caseId: "n", invocation: "automatic", expectedLoaded: false, loaded: false, outcomePassed: true, outcomeSupported: true },
    { status: "failure", model: "m", caseId: "x", invocation: "automatic", expectedLoaded: true, loaded: false, outcomePassed: false, outcomeSupported: false },
  ], acceptance);
  assert.equal(report.routing.recall, 1);
  assert.equal(report.routing.precision, 1);
  assert.equal(report.failures, 1);
  assert.equal(report.outcomes.supported, 2);
  assert.equal(report.complete, false);
});

test("aggregation enforces configured routing and workflow thresholds", () => {
  const report = aggregateResults([
    ...Array.from({ length: 3 }, () => ({ status: "success" as const, model: "m", caseId: "positive", invocation: "automatic" as const, expectedLoaded: true, loaded: false, outcomePassed: true, outcomeSupported: true })),
    ...Array.from({ length: 3 }, () => ({ status: "success" as const, model: "m", caseId: "negative", invocation: "automatic" as const, expectedLoaded: false, loaded: true, outcomePassed: true, outcomeSupported: true })),
  ], acceptance);
  assert.equal(report.routing.precision, 0);
  assert.equal(report.routing.recall, 0);
  assert.equal(report.thresholds.passed, false);
  assert.equal(report.complete, false);
});
