export type ChangeKind =
  | "new-behavior"
  | "bug"
  | "pure-refactor"
  | "existing-implementation"
  | "ordinary-static"
  | "contractual-copy"
  | "config-boundary"
  | "docs-comments"
  | "test-only"
  | "generated-vendor";

export type CoverageState = "sufficient" | "gap" | "unknown" | "not-applicable";
export type AutomationState = "feasible" | "unavailable" | "unsafe" | "flaky" | "disproportionate";
export type PolicyMode =
  | "tdd"
  | "regression-verification"
  | "preservation"
  | "validation-only"
  | "verification-limited";
export type EvidenceLabel =
  | "tdd-attested"
  | "regression-verified"
  | "preservation-verified"
  | "validation-only"
  | "verification-limited";

export interface PolicyInput {
  change: ChangeKind;
  coverage: CoverageState;
  automation: AutomationState;
  strictTdd: boolean;
}

export interface PolicyDecision {
  mode: PolicyMode;
  evidenceLabel: EvidenceLabel;
  permanentTest: "required" | "not-required" | "conditional";
  rationale: string[];
  nextProof: string[];
  safety: string[];
  residualRisk: string[];
}

const safety = [
  "Preserve pre-existing and user work; never revert or delete it to recreate test-first history.",
  "Report only observed commands and outcomes.",
];

function limited(input: PolicyInput): PolicyDecision {
  return {
    mode: "verification-limited",
    evidenceLabel: "verification-limited",
    permanentTest: "conditional",
    rationale: [`Automated verification is ${input.automation}; it cannot supply reliable red/green evidence.`],
    nextProof: ["Use the strongest safe static, manual, or live validation available."],
    safety,
    residualRisk: ["Sufficient automated verification is unavailable or unreliable; state the unverified contract explicitly."],
  };
}

export function decidePolicy(input: PolicyInput): PolicyDecision {
  if (input.automation !== "feasible") return limited(input);

  if (input.change === "existing-implementation" || input.change === "test-only") {
    return {
      mode: "regression-verification",
      evidenceLabel: "regression-verified",
      permanentTest: input.coverage === "sufficient" ? "not-required" : "conditional",
      rationale: [
        input.change === "existing-implementation"
          ? "Implementation already exists, so later coverage cannot truthfully be called TDD."
          : "Task changes tests rather than driving new production behavior.",
      ],
      nextProof: ["Run focused regression coverage and relevant surrounding checks."],
      safety,
      residualRisk: [],
    };
  }

  if (input.change === "pure-refactor") {
    return {
      mode: "preservation",
      evidenceLabel: "preservation-verified",
      permanentTest: input.coverage === "sufficient" ? "not-required" : "conditional",
      rationale: ["Pure refactoring preserves behavior and therefore starts from a green baseline."],
      nextProof: ["Run a green baseline before mutation and relevant regression checks after mutation."],
      safety,
      residualRisk: [],
    };
  }

  const staticChange = ["ordinary-static", "docs-comments", "generated-vendor"].includes(input.change);
  if (staticChange && !input.strictTdd) {
    return {
      mode: "validation-only",
      evidenceLabel: "validation-only",
      permanentTest: "not-required",
      rationale: ["No durable behavior regression justifies a new permanent test by default."],
      nextProof: ["Inspect the resulting artifact and run proportionate existing checks."],
      safety,
      residualRisk: [],
    };
  }

  if (input.coverage === "sufficient" && !input.strictTdd) {
    return {
      mode: "validation-only",
      evidenceLabel: "validation-only",
      permanentTest: "not-required",
      rationale: ["Existing coverage already proves the relevant contract; duplicate coverage adds maintenance cost."],
      nextProof: ["Run the existing focused coverage and relevant checks."],
      safety,
      residualRisk: [],
    };
  }

  return {
    mode: "tdd",
    evidenceLabel: "tdd-attested",
    permanentTest: "required",
    rationale: [input.strictTdd ? "User explicitly requested strict TDD." : "Observable contract or reproducible regression warrants focused test-first work."],
    nextProof: [
      "Write or update a focused desired-behavior test.",
      "Observe a valid behavior-specific red before production mutation.",
      "Observe focused green and run relevant regression checks.",
    ],
    safety,
    residualRisk: [],
  };
}
