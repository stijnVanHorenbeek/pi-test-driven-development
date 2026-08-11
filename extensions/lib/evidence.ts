import type { PolicyMode } from "./policy.ts";

export type RunPhase = "baseline" | "red" | "green" | "regression" | "broader" | "validation";
export type MutationCategory = "test" | "production" | "other";

export interface RunEvidenceInput {
  phase: RunPhase;
  command: string;
  exitCode: number | null;
  output: string;
  durationMs: number;
  expectedFailure?: string;
  cancelled?: boolean;
}

export interface RunEvidence extends RunEvidenceInput {
  sequence: number;
  valid: boolean;
}

export interface MutationEvidence {
  sequence: number;
  path: string;
  category: MutationCategory;
  source: "edit" | "write" | "other";
}

export interface LedgerDetails {
  version: 1;
  decision?: PolicyMode;
  nextSequence: number;
  runs: RunEvidence[];
  mutations: MutationEvidence[];
  opaqueMutations: Array<{ sequence: number; reason: string }>;
}

export interface LedgerStatus {
  decision?: PolicyMode;
  supportedLabel: "tdd-attested" | "regression-verified" | "preservation-verified" | "validation-only" | "verification-limited";
  runs: RunEvidence[];
  mutations: MutationEvidence[];
  missingProof: string[];
  warnings: string[];
  residualRisk: string[];
}

export function matchesExpectedFailure(expected: string | undefined, output: string) {
  const literal = expected?.trim().toLowerCase();
  if (!literal) return false;
  const setupFailure = /\b(?:cannot find (?:module|package)|module not found|err_module_not_found|command not found|no such file|cannot resolve|failed to load)\b/i.test(output)
    || (/SyntaxError:/i.test(output) && !/does not provide an export named/i.test(output));
  if (setupFailure) return false;
  return output.toLowerCase().includes(literal);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class EvidenceLedger {
  #details: LedgerDetails;

  constructor(details?: LedgerDetails) {
    this.#details = details ? clone(details) : {
      version: 1,
      nextSequence: 1,
      runs: [],
      mutations: [],
      opaqueMutations: [],
    };
  }

  static fromDetails(details: LedgerDetails) {
    if (details.version !== 1) throw new Error(`Unsupported evidence ledger version: ${details.version}`);
    return new EvidenceLedger(details);
  }

  setDecision(mode: PolicyMode) {
    this.#details.decision = mode;
  }

  recordMutation(input: Omit<MutationEvidence, "sequence">) {
    this.#details.mutations.push({ ...input, sequence: this.#next() });
  }

  recordOpaqueMutation(reason: string) {
    this.#details.opaqueMutations.push({ sequence: this.#next(), reason });
  }

  recordRun(input: RunEvidenceInput) {
    if (this.#details.decision === undefined) {
      if (input.phase === "red") this.#details.decision = "tdd";
      else if (input.phase === "baseline") this.#details.decision = "preservation";
      else if (input.phase === "regression") this.#details.decision = "regression-verification";
      else if (input.phase === "validation") this.#details.decision = "validation-only";
    }
    const valid = input.phase === "red"
      ? !input.cancelled
        && input.exitCode !== null
        && input.exitCode !== 0
        && matchesExpectedFailure(input.expectedFailure, input.output)
      : !input.cancelled && input.exitCode === 0;
    const run = { ...input, sequence: this.#next(), valid };
    this.#details.runs.push(run);
    return clone(run);
  }

  status(): LedgerStatus {
    const missingProof: string[] = [];
    const warnings = this.#details.opaqueMutations.map(({ reason }) => `Opaque mutation evidence: ${reason}`);
    const residualRisk: string[] = [];
    const decision = this.#details.decision;
    let supportedLabel: LedgerStatus["supportedLabel"] = "verification-limited";

    const latestMutation = this.#details.mutations.at(-1);

    if (decision === "tdd") {
      const red = this.#details.runs.find((run) => run.phase === "red" && run.valid);
      const firstProduction = this.#details.mutations.find((mutation) => mutation.category === "production");
      const testMutation = this.#details.mutations.find((mutation) => mutation.category === "test");
      const green = latestMutation
        ? this.#details.runs.find((run) => run.phase === "green" && run.valid && run.sequence > latestMutation.sequence)
        : undefined;

      if (!red) missingProof.push("No valid red was observed for the expected behavior failure.");
      if (!testMutation || (red && testMutation.sequence > red.sequence)) missingProof.push("No test mutation was observed before valid red.");
      if (!firstProduction) missingProof.push("No production mutation was observed after red.");
      if (firstProduction && (!red || red.sequence > firstProduction.sequence)) {
        missingProof.push("Valid red was not observed before production mutation.");
      }
      if (!green) missingProof.push("No focused green was observed after latest mutation.");
      if (missingProof.length === 0) supportedLabel = "tdd-attested";
    } else if (decision === "preservation") {
      const firstProduction = this.#details.mutations.find((mutation) => mutation.category === "production");
      const baseline = firstProduction && this.#details.runs.find(
        (run) => run.phase === "baseline" && run.valid && run.sequence < firstProduction.sequence,
      );
      const post = latestMutation && this.#details.runs.find(
        (run) => ["green", "regression", "broader", "validation"].includes(run.phase) && run.valid && run.sequence > latestMutation.sequence,
      );
      if (!baseline) missingProof.push("No green baseline was observed before first refactor mutation.");
      if (!firstProduction) missingProof.push("No production refactor mutation was observed.");
      if (!post) missingProof.push("No green preservation check was observed after latest mutation.");
      if (missingProof.length === 0) supportedLabel = "preservation-verified";
    } else if (decision === "regression-verification") {
      const regression = this.#details.runs.find(
        (run) => ["regression", "broader"].includes(run.phase) && run.valid && (!latestMutation || run.sequence > latestMutation.sequence),
      );
      if (!regression) missingProof.push("No passing regression command was observed after latest mutation.");
      if (missingProof.length === 0) supportedLabel = "regression-verified";
    } else if (decision === "validation-only") {
      const validation = this.#details.runs.find(
        (run) => run.phase === "validation" && run.valid && (!latestMutation || run.sequence > latestMutation.sequence),
      );
      if (!validation) missingProof.push("No successful proportional validation was observed after latest mutation.");
      if (missingProof.length === 0) supportedLabel = "validation-only";
    } else {
      residualRisk.push("Verification is limited; automated evidence does not establish the full contract.");
    }

    if (this.#details.opaqueMutations.length > 0 && supportedLabel !== "verification-limited") {
      supportedLabel = "verification-limited";
      missingProof.push("Opaque shell mutation prevents trustworthy evidence ordering.");
    }

    if (missingProof.length > 0 && residualRisk.length === 0) {
      residualRisk.push("Requested evidence label is unsupported by observed session events.");
    }

    return {
      decision,
      supportedLabel,
      runs: clone(this.#details.runs),
      mutations: clone(this.#details.mutations),
      missingProof,
      warnings,
      residualRisk,
    };
  }

  toDetails() {
    return clone(this.#details);
  }

  #next() {
    const value = this.#details.nextSequence;
    this.#details.nextSequence += 1;
    return value;
  }
}
