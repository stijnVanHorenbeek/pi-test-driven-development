import assert from "node:assert/strict";
import test from "node:test";

import { EvidenceLedger, matchesExpectedFailure } from "../extensions/lib/evidence.ts";

function validTddLedger() {
  const ledger = new EvidenceLedger();
  ledger.setDecision("tdd");
  ledger.recordMutation({ path: "test/math.test.js", category: "test", source: "edit" });
  ledger.recordRun({
    phase: "red",
    command: "node --test test/math.test.js",
    exitCode: 1,
    output: "AssertionError: expected 6, received undefined",
    expectedFailure: "expected 6",
    durationMs: 20,
  });
  ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
  ledger.recordRun({
    phase: "green",
    command: "node --test test/math.test.js",
    exitCode: 0,
    output: "pass 1",
    durationMs: 18,
  });
  return ledger;
}

test("attests TDD only for observed order with no later mutation", () => {
  const ledger = validTddLedger();
  const status = ledger.status();
  assert.equal(status.supportedLabel, "tdd-attested");
  assert.equal(status.missingProof.length, 0);
  assert.equal(status.runs[0]?.valid, true);
  ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
  assert.equal(ledger.status().supportedLabel, "verification-limited");
});

test("setup failures cannot masquerade as behavior-specific red", () => {
  assert.equal(matchesExpectedFailure("multiply is not a function", "Error: Cannot find module multiply"), false);
  assert.equal(matchesExpectedFailure("multiply", "SyntaxError: requested module does not provide an export named 'multiply'"), true);
});

test("passing-first and wrong-reason red are invalid", () => {
  for (const run of [
    { exitCode: 0, output: "pass 1", expectedFailure: "expected 6" },
    { exitCode: 1, output: "SyntaxError: typo", expectedFailure: "expected 6" },
  ]) {
    const ledger = new EvidenceLedger();
    ledger.setDecision("tdd");
    ledger.recordMutation({ path: "test/math.test.js", category: "test", source: "write" });
    ledger.recordRun({
      phase: "red",
      command: "npm test",
      durationMs: 1,
      ...run,
    });
    ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
    ledger.recordRun({ phase: "green", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
    const status = ledger.status();
    assert.notEqual(status.supportedLabel, "tdd-attested");
    assert.match(status.missingProof.join(" "), /valid red/i);
  }
});

test("production mutation before red cannot become TDD", () => {
  const ledger = new EvidenceLedger();
  ledger.setDecision("tdd");
  ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
  ledger.recordMutation({ path: "test/math.test.js", category: "test", source: "edit" });
  ledger.recordRun({
    phase: "red",
    command: "npm test",
    exitCode: 1,
    output: "expected 6",
    expectedFailure: "expected 6",
    durationMs: 1,
  });
  ledger.recordRun({ phase: "green", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
  const status = ledger.status();
  assert.notEqual(status.supportedLabel, "tdd-attested");
  assert.match(status.missingProof.join(" "), /before.*production/i);
});

test("preservation requires baseline before first mutation and verification after latest mutation", () => {
  for (const phase of ["green", "regression"] as const) {
    const ledger = new EvidenceLedger();
    ledger.setDecision("preservation");
    ledger.recordRun({ phase: "baseline", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
    ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
    ledger.recordRun({ phase, command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
    assert.equal(ledger.status().supportedLabel, "preservation-verified");
    ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
    assert.equal(ledger.status().supportedLabel, "verification-limited");
  }

  const reversed = new EvidenceLedger();
  reversed.setDecision("preservation");
  reversed.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
  reversed.recordRun({ phase: "baseline", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
  reversed.recordRun({ phase: "green", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
  assert.equal(reversed.status().supportedLabel, "verification-limited");
});

test("evidence phase infers a conservative mode when policy decision was skipped", () => {
  const regression = new EvidenceLedger();
  regression.recordMutation({ path: "test/math.test.js", category: "test", source: "edit" });
  regression.recordRun({ phase: "regression", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
  assert.equal(regression.status().decision, "regression-verification");
  assert.equal(regression.status().supportedLabel, "regression-verified");

  const red = new EvidenceLedger();
  red.recordRun({ phase: "red", command: "npm test", exitCode: 1, output: "multiply missing", expectedFailure: "multiply", durationMs: 1 });
  assert.equal(red.status().decision, "tdd");
});

test("pre-existing implementation receives regression label without fake red or duplicate test requirement", () => {
  for (const addTest of [false, true]) {
    const ledger = new EvidenceLedger();
    ledger.setDecision("regression-verification");
    if (addTest) ledger.recordMutation({ path: "test/math.test.js", category: "test", source: "edit" });
    ledger.recordRun({ phase: "regression", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
    const status = ledger.status();
    assert.equal(status.supportedLabel, "regression-verified");
    assert.equal(status.runs.some((run) => run.phase === "red"), false);
    ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
    assert.equal(ledger.status().supportedLabel, "verification-limited");
  }
});

test("validation-only requires validation after latest mutation and limited stays honest", () => {
  const validation = new EvidenceLedger();
  validation.setDecision("validation-only");
  validation.recordRun({ phase: "validation", command: "npm run check", exitCode: 0, output: "ok", durationMs: 1 });
  validation.recordMutation({ path: "public/index.html", category: "production", source: "edit" });
  assert.equal(validation.status().supportedLabel, "verification-limited");
  validation.recordRun({ phase: "validation", command: "npm run check", exitCode: 0, output: "ok", durationMs: 1 });
  assert.equal(validation.status().supportedLabel, "validation-only");

  const limited = new EvidenceLedger();
  limited.setDecision("verification-limited");
  assert.equal(limited.status().supportedLabel, "verification-limited");
  assert.ok(limited.status().residualRisk.length > 0);
});

test("opaque shell mutation downgrades sequence claims", () => {
  const ledger = validTddLedger();
  ledger.recordOpaqueMutation("bash command may have changed files");
  const status = ledger.status();
  assert.notEqual(status.supportedLabel, "tdd-attested");
  assert.match(status.warnings.join(" "), /opaque/i);
});

test("ledger reconstructs from persisted details without changing order", () => {
  const original = validTddLedger();
  const restored = EvidenceLedger.fromDetails(original.toDetails());
  assert.deepEqual(restored.toDetails(), original.toDetails());
  assert.equal(restored.status().supportedLabel, "tdd-attested");
});
