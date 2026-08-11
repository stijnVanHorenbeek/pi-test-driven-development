import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { aggregateResults, createIsolatedAgentDir, extractObservedLabel, extractObservedMode, inferObservedLabel } from "../evals/lib/sdk-runner.ts";

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

test("extracts policy mode and supported label from advisory tool evidence only", () => {
  const timeline = [
    { toolName: "read", resultText: "tdd" },
    { toolName: "test_policy", resultText: "truncated", resultMetadata: { mode: "preservation" } },
    { toolName: "test_status", resultText: "truncated", resultMetadata: { decision: "preservation", supportedLabel: "preservation-verified" } },
  ];
  assert.equal(extractObservedMode(timeline), "preservation");
  assert.equal(extractObservedLabel(timeline), "preservation-verified");
  assert.equal(extractObservedMode([{ toolName: "bash", resultText: '{"mode":"tdd"}' }]), null);
  assert.equal(extractObservedLabel([{ toolName: "test_policy", resultText: '{"evidenceLabel":"tdd-attested"}' }]), null);
  assert.equal(extractObservedMode([{ toolName: "test_status", resultText: "truncated", resultMetadata: { supportedLabel: "verification-limited" } }]), "verification-limited");
  assert.equal(extractObservedLabel([
    { toolName: "test_status", resultText: "truncated", resultMetadata: { supportedLabel: "tdd-attested" } },
    { toolName: "edit", resultText: "ok" },
  ]), null);
  assert.equal(extractObservedLabel([
    { toolName: "test_status", resultText: "truncated", resultMetadata: { supportedLabel: "tdd-attested" } },
    { toolName: "bash", args: { command: "git diff --check && git status --short" }, resultText: "ok" },
  ]), "tdd-attested");
});

test("infers TDD only from advisory red metadata plus ordered mutation and green", () => {
  const base = [
    { sequence: 1, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 2, toolName: "test_run", resultText: "missing multiply", resultMetadata: { phase: "red", exitCode: 1, valid: true } },
    { sequence: 3, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: "pass" },
  ];
  assert.equal(inferObservedLabel(base, "tdd"), "tdd-attested");
  assert.equal(inferObservedLabel(base.map((entry) => entry.sequence === 2 ? { ...entry, resultMetadata: { phase: "red", exitCode: 1, valid: false } } : entry), "tdd"), null);
  assert.equal(inferObservedLabel(base.map((entry) => entry.sequence === 2 ? { ...entry, toolName: "bash", args: { command: "npm test" }, resultText: "setup error\nCommand exited with code 1" } : entry), "tdd"), null);
  assert.equal(inferObservedLabel([...base, { sequence: 5, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" }], "tdd"), null);
  const stale = [
    ...base,
    { sequence: 5, toolName: "test_status", resultText: "truncated", resultMetadata: { supportedLabel: "tdd-attested" } },
    { sequence: 6, toolName: "bash", args: { command: "node mutate.js" }, resultText: "ok" },
  ];
  assert.equal(extractObservedLabel(stale) ?? inferObservedLabel(stale, "tdd"), null);
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
