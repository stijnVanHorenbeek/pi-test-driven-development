import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { aggregateResults, candidateRedRuns, createIsolatedAgentDir, inferObservedWorkflow } from "../evals/lib/sdk-runner.ts";

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
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "npm test" }, resultText: "# tests 1\n# pass 1\n# fail 0" },
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
      { sequence: 7, completionSequence: 8, toolName: "bash", args: { command }, resultText: command === "go test ./..." ? "--- PASS: TestMultiply (0.00s)" : command === "pytest" ? "1 passed in 0.01s" : "Ran 1 test in 0.001s\n\nOK\n" },
    ];
    assert.equal(inferObservedWorkflow(timeline, "Evidence: tdd-attested", "multiply").observedLabel, "tdd-attested");
  }
});

test("validates preservation, regression, validation, and limited claims from built-ins", () => {
  assert.equal(inferObservedWorkflow([
    { sequence: 1, completionSequence: 2, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" },
    { sequence: 3, completionSequence: 4, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 5, completionSequence: 6, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" },
  ], "Evidence: preservation-verified").observedLabel, "preservation-verified");

  const regression = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" },
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
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "src/Calculator.csproj" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "dotnet build src/Calculator.csproj" }, resultText: "Build succeeded." },
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

test("dotnet green needs executed passing tests, not a successful zero-test restore", () => {
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "tests/CalculatorTests.cs" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "dotnet test tests/Calculator.Tests.csproj" }, resultText: "Failed Fixture.ClampTests.ClampsOutOfRange\nExpected: 5\nActual: 9\nFailed: 1, Passed: 1, Skipped: 0, Total: 2\nCommand exited with code 1", isError: true },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/Calculator.cs" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "dotnet test tests/Calculator.Tests.csproj" }, resultText: "Passed!  - Failed: 0, Passed: 2, Skipped: 0, Total: 2" },
  ];
  const observed = (last: typeof timeline[number]) => inferObservedWorkflow([...timeline.slice(0, 3), last], "Evidence: tdd-attested", "ClampsOutOfRange|Expected: 5").observedLabel;
  assert.equal(observed(timeline[3]!), "tdd-attested");
  const compileFailure = timeline.map((entry) => entry.sequence === 3 ? {
    ...entry, resultText: "tests/CalculatorTests.cs(4,12): error CS1002: ; expected in ClampTests\nCommand exited with code 1",
  } : entry);
  assert.equal(inferObservedWorkflow(compileFailure, "Evidence: tdd-attested", "Clamp|Expected: 5").observedLabel, null, "compiler errors are not red");
  for (const output of [
    "No test matches the given testcase filter.\nBuild succeeded.",
    "Passed!  - Failed: 0, Passed: 0, Skipped: 2, Total: 2",
    "Passed!  - Failed: 1, Passed: 1, Skipped: 0, Total: 2",
  ]) assert.equal(observed({ ...timeline[3]!, resultText: output }), null, output);
});

test("TDD green must rerun the red scope and execute a passing test", () => {
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "node --test test/math.test.js" }, resultText: "multiply missing\nCommand exited with code 1" },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "node --test test/math.test.js" }, resultText: "# tests 1\n# pass 1\n# fail 0" },
  ];
  assert.equal(inferObservedWorkflow(timeline, "Evidence: tdd-attested", "multiply").observedLabel, "tdd-attested");
  for (const green of [
    { command: "node --test test/unrelated.test.js", output: "# tests 1\n# pass 1\n# fail 0" },
    { command: "node --test test/math.test.js", output: "# tests 0\n# pass 0\n# fail 0" },
    { command: "node --test test/math.test.js", output: "# tests 1\n# pass 0\n# skipped 1" },
    { command: "node --test test/math.test.js", output: "process exited successfully" },
  ]) {
    const last = { ...timeline[3]!, args: { command: green.command }, resultText: green.output };
    assert.equal(inferObservedWorkflow([...timeline.slice(0, 3), last], "Evidence: tdd-attested", "multiply").observedLabel, null, JSON.stringify(green));
  }
});

test("a final broad Node run can verify the focused test after a later test-only edit", () => {
  const focused = "node --test --test-name-pattern='rejects a zero divisor' test/math.test.js";
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: focused }, resultText: "✖ rejects a zero divisor\nMissing expected exception (RangeError)\nCommand exited with code 1", isError: true },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: focused }, resultText: "✔ rejects a zero divisor (0.3ms)\nℹ tests 1\nℹ pass 1" },
    { sequence: 9, completionSequence: 10, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 11, completionSequence: 12, toolName: "bash", args: { command: "npm test" }, resultText: "npm notice run test\nnpm notice run node --test\n✔ divides with nonzero divisors\n✔ rejects a zero divisor (0.2ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0" },
  ];
  const observed = (events: Parameters<typeof inferObservedWorkflow>[0]) => inferObservedWorkflow(events, "Evidence: tdd-attested", "RangeError").observedLabel;
  assert.equal(observed(timeline), "tdd-attested");
  const scoped = inferObservedWorkflow(timeline, "Evidence: tdd-attested — division", undefined, [{
    name: "division", mode: "tdd", paths: ["test/math.test.js", "src/math.js"],
    command_pattern: "^node --test --test-name-pattern=.*test/math\\.test\\.js$", red_output_pattern: "RangeError",
  }]);
  assert.equal(scoped.scopes?.[0]?.observedLabel, "tdd-attested", "scoped evidence also accepts a proven broad final run");
  const last = timeline[5]!;
  for (const invalid of [
    { ...last, resultText: "npm notice run test\nnpm notice run node --test\n✔ unrelated test\nℹ tests 1\nℹ pass 1" },
    { ...last, resultText: "npm notice run test\nnpm notice run node --test\n↷ rejects a zero divisor (skipped)\n✔ unrelated test\nℹ tests 2\nℹ pass 1\nℹ skipped 1" },
    { ...last, resultText: "✔ rejects a zero divisor\nℹ pass 1" },
    { ...last, args: { command: "node --test test/unrelated.test.js" } },
    { ...last, resultText: "npm notice run node --test\n✔ rejects a zero divisor\nℹ pass 1\nCommand exited with code 1", isError: true },
  ]) assert.equal(observed([...timeline.slice(0, 5), invalid]), null, JSON.stringify(invalid));
  assert.equal(observed([...timeline.slice(0, 3), ...timeline.slice(4)]), null, "a broad run cannot replace the initial focused green");
  const laterProduction = [...timeline.slice(0, 5), { sequence: 11, completionSequence: 12, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" }, { ...last, sequence: 13, completionSequence: 14 }];
  assert.equal(observed(laterProduction), null, "broad fallback must not cover a later production edit");
});

test("mixed labels without an explicit scope mapping stay unsupported in either order", () => {
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "src/config.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "read", args: { path: "src/config.js" }, resultText: "updated" },
  ];
  const claims = ["Evidence: validation-only — config", "Evidence: verification-limited — delivery gap"];
  for (const text of [
    claims.join("\n"), [...claims].reverse().join("\n"),
    "Evidence: validation-only — config\nEvidence: **verification-limited** — delivery gap",
    "Evidence: validation-only — config\nEvidence: unknown-label — delivery gap",
  ]) {
    assert.equal(inferObservedWorkflow(timeline, text).observedLabel, null);
  }
});

test("declared scopes bind each claim to its own files and verification commands", () => {
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/input.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "node --test test/input.test.js" }, resultText: "input required\nCommand exited with code 1" },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/input.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "node --test test/input.test.js" }, resultText: "# pass 1" },
    { sequence: 9, completionSequence: 10, toolName: "edit", args: { path: "src/webhook.js" }, resultText: "ok" },
    { sequence: 11, completionSequence: 12, toolName: "read", args: { path: "src/webhook.js" }, resultText: "updated" },
  ];
  const scopes = [
    { name: "input validation", mode: "tdd" as const, paths: ["src/input.js", "test/input.test.js"], command_pattern: "^node --test test/input\\.test\\.js$", red_output_pattern: "input required" },
    { name: "webhook delivery", mode: "verification-limited" as const, paths: ["src/webhook.js"], command_pattern: "^npm run check$" },
  ];
  const claims = ["Evidence: tdd-attested — input validation", "Evidence: verification-limited — webhook delivery"];
  for (const text of [claims.join("\n"), [...claims].reverse().join("\n"), claims.map((line) => line.replace(/(tdd-attested|verification-limited)/, "**$1**")).join("\n")]) {
    const result = inferObservedWorkflow(timeline, `Receiver unavailable; integration gap remains.\n${text}`, undefined, scopes);
    assert.deepEqual(result.scopes?.map(({ name, observedLabel }) => [name, observedLabel]), [
      ["input validation", "tdd-attested"], ["webhook delivery", "verification-limited"],
    ]);
  }
  const incomplete = inferObservedWorkflow(timeline, claims[0]!, undefined, scopes);
  assert.equal(incomplete.scopes?.find((scope) => scope.name === "webhook delivery")?.observedLabel, null);
  const wrongCommand = timeline.map((entry) => entry.sequence === 7 ? { ...entry, args: { command: "node --test test/elsewhere.test.js" } } : entry);
  assert.equal(inferObservedWorkflow(wrongCommand, claims.join("\n"), undefined, scopes).scopes?.[0]?.observedLabel, null);
});

test("red candidates belong to their own pre-production scope", () => {
  const scopes = ["alpha", "beta"].map((name) => ({ name, mode: "tdd" as const, paths: [`test/${name}.test.js`, `src/${name}.js`], command_pattern: `^node --test test/${name}\\.test\\.js$` }));
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/alpha.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "node --test test/alpha.test.js" }, resultText: "alpha missing\nCommand exited with code 1" },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/alpha.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "node --test test/alpha.test.js" }, resultText: "alpha assertion after implementation\nCommand exited with code 1" },
    { sequence: 9, completionSequence: 10, toolName: "edit", args: { path: "test/beta.test.js" }, resultText: "ok" },
    { sequence: 11, completionSequence: 12, toolName: "bash", args: { command: "node --test test/beta.test.js" }, resultText: "beta missing\nCommand exited with code 1" },
    { sequence: 13, completionSequence: 14, toolName: "edit", args: { path: "src/beta.js" }, resultText: "ok" },
  ];
  assert.deepEqual(candidateRedRuns(timeline, scopes).map((run) => run.sequence), [3, 11]);
});

test("semantic gap evidence stays with its declared scope", () => {
  const scopes = ["alpha", "beta"].map((name) => ({ name, mode: "verification-limited" as const, paths: [`src/${name}.js`], command_pattern: "^npm run check$" }));
  const timeline = scopes.flatMap((scope, index) => [
    { sequence: index * 4 + 1, completionSequence: index * 4 + 2, toolName: "edit", args: { path: scope.paths[0] }, resultText: "ok" },
    { sequence: index * 4 + 3, completionSequence: index * 4 + 4, toolName: "read", args: { path: scope.paths[0] }, resultText: "ok" },
  ]);
  const text = "Alpha integration unavailable.\nEvidence: verification-limited — alpha\nEvidence: verification-limited — beta";
  const result = inferObservedWorkflow(timeline, text, undefined, scopes, { gapAcknowledgedByScope: { alpha: true, beta: false } });
  assert.deepEqual(result.scopes?.map((scope) => scope.observedLabel), ["verification-limited", null]);
});

test("Jev semantic inputs cannot create claims or bypass deterministic red/green and gaps", () => {
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: "AssertionError: Missing expected exception\nCommand exited with code 1" },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" },
  ];
  const semantic = { redFailures: [3], gapAcknowledged: false };
  assert.equal(inferObservedWorkflow(timeline, "Tests passed", "wrong pattern", undefined, semantic).observedLabel, null);
  assert.equal(inferObservedWorkflow(timeline, "Evidence: tdd-attested", "wrong pattern", undefined, semantic).observedLabel, "tdd-attested");
  assert.equal(inferObservedWorkflow(timeline, "Evidence: tdd-attested", undefined, undefined, semantic).observedLabel, "tdd-attested", "a confirmed red needs no keyword pattern");
  assert.equal(inferObservedWorkflow(timeline.slice(0, 3), "Evidence: tdd-attested", "wrong pattern", undefined, semantic).observedLabel, null);
  assert.equal(inferObservedWorkflow(timeline, "Evidence: tdd-attested", "wrong pattern", undefined, { ...semantic, redFailures: [] }).observedLabel, null);
  const limited = [timeline[2]!, { sequence: 7, completionSequence: 8, toolName: "read", args: { path: "src/math.js" }, resultText: "ok" }];
  assert.equal(inferObservedWorkflow(limited, "Residual risk. Evidence: verification-limited", undefined, undefined, { gapAcknowledged: false }).observedLabel, null);
  assert.equal(inferObservedWorkflow(limited, "Evidence: verification-limited", undefined, undefined, { gapAcknowledged: true }).observedLabel, "verification-limited");
});

test("existing regression coverage needs no artificial test edit", () => {
  assert.equal(inferObservedWorkflow([
    { sequence: 1, completionSequence: 2, toolName: "bash", args: { command: "npm test" }, resultText: "# tests 2\n# pass 2\n# fail 0" },
  ], "Evidence: regression-verified").observedLabel, "regression-verified");
});

test("ordinary failures tolerate 2/3 while safety and evidence remain hard gates", () => {
  const base = { status: "success" as const, model: "m", caseId: "p", invocation: "automatic" as const, expectedLoaded: true, loaded: true, outcomeSupported: true, userWorkPassed: true };
  const samples = [true, true, false].map((outcomePassed) => ({ ...base, outcomePassed }));
  const report = aggregateResults(samples, acceptance);
  assert.equal(report.complete, true, "all three executions completed, independently of acceptance");
  assert.equal(report.accepted, true, "2/3 ordinary outcomes meet the declared threshold");
  assert.equal(aggregateResults(samples.map((sample, i) => ({ ...sample, userWorkPassed: i !== 2 })), acceptance).accepted, false);
  assert.equal(aggregateResults(samples.map((sample, i) => ({ ...sample, outcomeSupported: i !== 2 })), acceptance).accepted, false);
});

test("aggregation keeps failures and unsupported outcomes visible", () => {
  const report = aggregateResults([
    { status: "success", model: "m", caseId: "p", invocation: "automatic", expectedLoaded: true, loaded: true, outcomePassed: true, outcomeSupported: true, userWorkPassed: true },
    { status: "success", model: "m", caseId: "n", invocation: "automatic", expectedLoaded: false, loaded: false, outcomePassed: true, outcomeSupported: true, userWorkPassed: true },
    { status: "failure", model: "m", caseId: "x", invocation: "automatic", expectedLoaded: true, loaded: false, outcomePassed: false, outcomeSupported: false, userWorkPassed: true },
  ], acceptance);
  assert.equal(report.routing.recall, 1);
  assert.equal(report.routing.precision, 1);
  assert.equal(report.failures, 1);
  assert.equal(report.outcomes.supported, 2);
  assert.equal(report.complete, false);
});

test("aggregation enforces configured routing and workflow thresholds", () => {
  const report = aggregateResults([
    ...Array.from({ length: 3 }, () => ({ status: "success" as const, model: "m", caseId: "positive", invocation: "automatic" as const, expectedLoaded: true, loaded: false, outcomePassed: true, outcomeSupported: true, userWorkPassed: true })),
    ...Array.from({ length: 3 }, () => ({ status: "success" as const, model: "m", caseId: "negative", invocation: "automatic" as const, expectedLoaded: false, loaded: true, outcomePassed: true, outcomeSupported: true, userWorkPassed: true })),
  ], acceptance);
  assert.equal(report.routing.precision, 0);
  assert.equal(report.routing.recall, 0);
  assert.equal(report.thresholds.passed, false);
  assert.equal(report.complete, true);
  assert.equal(report.accepted, false);
});
