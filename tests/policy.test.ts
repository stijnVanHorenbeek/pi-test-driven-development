import assert from "node:assert/strict";
import test from "node:test";

import { decidePolicy } from "../extensions/lib/policy.ts";

const feasibleGap = {
  coverage: "gap" as const,
  automation: "feasible" as const,
  strictTdd: false,
};

test("new behavior and reproducible bugs default to TDD", () => {
  for (const change of ["new-behavior", "bug", "contractual-copy", "config-boundary"] as const) {
    const decision = decidePolicy({ change, ...feasibleGap });
    assert.equal(decision.mode, "tdd", change);
    assert.equal(decision.evidenceLabel, "tdd-attested", change);
    assert.match(decision.nextProof.join(" "), /red/i);
  }
});

test("pure refactor starts from preservation, never artificial red", () => {
  const decision = decidePolicy({ change: "pure-refactor", ...feasibleGap });
  assert.equal(decision.mode, "preservation");
  assert.equal(decision.evidenceLabel, "preservation-verified");
  assert.doesNotMatch(decision.nextProof.join(" "), /failing test first/i);
});

test("pre-existing implementation selects regression verification", () => {
  const decision = decidePolicy({
    change: "existing-implementation",
    coverage: "gap",
    automation: "feasible",
    strictTdd: true,
  });
  assert.equal(decision.mode, "regression-verification");
  assert.equal(decision.evidenceLabel, "regression-verified");
  assert.match(decision.safety.join(" "), /preserv/i);
});

test("ordinary static, docs, test-only, and generated work avoid artificial TDD", () => {
  for (const change of ["ordinary-static", "docs-comments", "test-only", "generated-vendor"] as const) {
    const decision = decidePolicy({ change, ...feasibleGap });
    assert.equal(decision.mode, change === "test-only" ? "regression-verification" : "validation-only", change);
    assert.notEqual(decision.evidenceLabel, "tdd-attested", change);
  }
});

test("unavailable, unsafe, flaky, or disproportionate automation is verification-limited", () => {
  for (const automation of ["unavailable", "unsafe", "flaky", "disproportionate"] as const) {
    const decision = decidePolicy({
      change: "new-behavior",
      coverage: "gap",
      automation,
      strictTdd: false,
    });
    assert.equal(decision.mode, "verification-limited", automation);
    assert.equal(decision.evidenceLabel, "verification-limited", automation);
    assert.ok(decision.residualRisk.length > 0);
  }
});

test("sufficient existing coverage prevents duplicate permanent tests", () => {
  const decision = decidePolicy({
    change: "pure-refactor",
    coverage: "sufficient",
    automation: "feasible",
    strictTdd: false,
  });
  assert.equal(decision.mode, "preservation");
  assert.equal(decision.permanentTest, "not-required");
});

test("strict TDD can override ordinary copy default but not pre-existing history or unsafe automation", () => {
  assert.equal(
    decidePolicy({
      change: "ordinary-static",
      coverage: "gap",
      automation: "feasible",
      strictTdd: true,
    }).mode,
    "tdd",
  );
  assert.equal(
    decidePolicy({
      change: "existing-implementation",
      coverage: "gap",
      automation: "feasible",
      strictTdd: true,
    }).mode,
    "regression-verification",
  );
  assert.equal(
    decidePolicy({
      change: "ordinary-static",
      coverage: "gap",
      automation: "unsafe",
      strictTdd: true,
    }).mode,
    "verification-limited",
  );
});
