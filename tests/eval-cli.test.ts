import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { buildRequest } from "../evals/jev/judge.ts";
import { loadEvaluationSpec } from "../evals/lib/spec.ts";
import { sha256 } from "../evals/lib/runner.ts";

const exec = promisify(execFile);

test("plain eval selects every case; removed track switch is rejected", async (context) => {
  const resultsDir = await mkdtemp(join(tmpdir(), "pi-tdd-default-selection-"));
  context.after(() => rm(resultsDir, { recursive: true, force: true }));
  await assert.rejects(() => exec(process.execPath, ["--import", "tsx", "evals/run-evals.ts", "--report-only", "--results-dir", resultsDir]), (error: any) => error.code === 1);
  const report = JSON.parse(await readFile(join(resultsDir, "report.json"), "utf8"));
  const spec = await loadEvaluationSpec(new URL("../", import.meta.url));
  assert.equal(report.selectedCells, spec.cases.length * spec.matrix.models.length * spec.matrix.repetitions);
  assert.equal(report.diagnosticSelection, false);
  await assert.rejects(() => exec(process.execPath, ["--import", "tsx", "evals/run-evals.ts", "--report-only", "--track", "tuning", "--results-dir", resultsDir]), (error: any) => error.code === 2 && /Unknown argument: --track/.test(error.stderr));
});

test("report-only CLI preserves history, reports retries, and gates diagnostics on safety without model calls", async (context) => {
  const resultsDir = await mkdtemp(join(tmpdir(), "pi-tdd-report-"));
  context.after(() => rm(resultsDir, { recursive: true, force: true }));
  async function report(extra: string[] = []) {
    const args = ["--import", "tsx", "evals/run-evals.ts", "--report-only", "--case", "logic-feature", "--model", "openai-codex:gpt-6-sol", "--repetitions", "1", "--results-dir", resultsDir, ...extra];
    let exitCode = 0;
    try { await exec(process.execPath, args); }
    catch (error: any) { if (typeof error.code !== "number") throw error; exitCode = error.code; }
    return { exitCode, data: JSON.parse(await readFile(join(resultsDir, "report.json"), "utf8")) };
  }
  const missing = await report();
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.data.recordedCells, 0);
  const path = join(resultsDir, missing.data.cacheKey, "raw", missing.data.missing[0]);
  await mkdir(join(resultsDir, missing.data.cacheKey, "raw"), { recursive: true });
  const success = {
    status: "success", cell: { provider: "openai-codex", model: "gpt-6-sol", thinking: "medium", arm: "skill", repetition: 1, caseId: "logic-feature", invocation: "automatic" },
    expectedLoaded: true, loaded: true, response: { usage: { totalTokens: 200, costUsd: 0.2 } },
    outcome: { passed: true, supported: true, artifactPassed: true, userWorkPassed: true },
  };
  const failed = { ...success, status: "failure", response: { usage: { totalTokens: 100, costUsd: 0.1 } } };
  const raw = { schemaVersion: 2, cacheKey: missing.data.cacheKey, provenance: { ...missing.data.provenance, packageCommit: "different", packageDirty: !missing.data.provenance.packageDirty }, attempts: [failed, success] };
  await writeFile(path, JSON.stringify(raw));
  const passed = await report();
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.data.selectionPassed, true);
  assert.equal(passed.data.qualified, false);
  assert.equal(passed.data.attemptFailures, 1);
  assert.equal(passed.data.totalTokens, 300);
  assert.ok(Math.abs(passed.data.costUsd - 0.3) < 1e-10);

  const other = await report(["--thinking", "low"]);
  assert.equal(other.exitCode, 1);
  assert.equal(other.data.recordedCells, 0);
  assert.equal(JSON.parse(await readFile(path, "utf8")).attempts.length, 2);
  const baseline = await report(["--arm", "baseline"]);
  assert.equal(baseline.exitCode, 1);
  assert.equal(baseline.data.recordedCells, 0);
  const jev = await report(["--judge", "jev"]);
  assert.equal(jev.exitCode, 1, "missing semantic evidence cannot be promoted by Jev");
  assert.equal(jev.data.judge, "jev");
  assert.equal(jev.data.samples[0].outcomeSupported, false);
  assert.equal(JSON.parse(await readFile(path, "utf8")).attempts.length, 2, "Jev report must never rewrite recorded GPT attempts");

  const item = JSON.parse(await readFile("evals/cases.json", "utf8")).cases.find((entry: any) => entry.id === "logic-feature");
  const output = "AssertionError: multiply missing\nCommand exited with code 1";
  raw.attempts[1] = {
    ...success,
    response: { ...success.response, finalText: "Evidence: tdd-attested", timeline: [
      { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
      { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: output },
      { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
      { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "npm test" }, resultText: "# tests 1\n# pass 1" },
    ] },
    workspace: { changedPaths: ["test/math.test.js", "src/math.js"], diff: "" },
    postcheck: { exitCode: 0, stdout: "", stderr: "" }, preservedWorking: {},
    outcome: { ...success.outcome, supported: false },
  } as any;
  await writeFile(path, JSON.stringify(raw));
  const request = buildRequest({ id: "red", kind: "failure", state: { text: output, contract: item.task, truncated: false }, expected: {}, reviewNote: "" });
  const hash = sha256(JSON.stringify(request));
  await mkdir(join(resultsDir, "jev-cache"), { recursive: true });
  await writeFile(join(resultsDir, "jev-cache", `${hash}.json`), JSON.stringify({ request, response: {
    model: request.model, answers: { failure: { type: "choice", choice: "contract_failure", confidence: 1,
      probabilities: { contract_failure: 1, setup_failure: 0, unrelated_failure: 0, insufficient: 0 } } },
    usage: { input_tokens: 1, output_tokens: 1 },
  }, attempts: 1 }));
  const hybrid = await report(["--judge", "jev"]);
  assert.equal(hybrid.exitCode, 0);
  assert.equal(hybrid.data.samples[0].outcomeSupported, true);
  assert.equal(hybrid.data.samples[0].judgment.judgments[0].source, "cached");
  assert.equal(JSON.parse(await readFile(path, "utf8")).attempts[1].outcome.supported, false, "raw scoring stays immutable");

  raw.attempts[0]!.outcome = { ...raw.attempts[0]!.outcome, userWorkPassed: false };
  await writeFile(path, JSON.stringify(raw));
  const unsafe = await report();
  assert.equal(unsafe.exitCode, 1);
  assert.equal(unsafe.data.samples[0].userWorkPassed, false);
});
