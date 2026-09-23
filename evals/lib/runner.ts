import { createHash } from "node:crypto";

import type { EvaluationCase } from "./spec.ts";
import type { loadEvaluationSpec } from "./spec.ts";

export type EvaluationSpec = Awaited<ReturnType<typeof loadEvaluationSpec>>;
export type EvaluationArm = "skill" | "baseline";

export interface EvaluationCell {
  provider: string;
  model: string;
  thinking: string;
  arm: EvaluationArm;
  repetition: number;
  case: EvaluationCase;
}

export function iterCells(spec: EvaluationSpec, arm: EvaluationArm | "both" = "skill"): EvaluationCell[] {
  return spec.matrix.models.flatMap((model) =>
    spec.cases.flatMap((item) =>
      (arm === "both" ? ["skill", "baseline"] as const : [arm]).flatMap((selectedArm) =>
        selectedArm === "baseline" && item.invocation === "explicit" ? [] :
          Array.from({ length: spec.matrix.repetitions }, (_, index) => ({
            ...model,
            arm: selectedArm,
            repetition: index + 1,
            case: item,
          })),
      ),
    ),
  );
}

export function buildPrompt(item: EvaluationCase) {
  return item.invocation === "explicit"
    ? `/skill:test-driven-development ${item.task}`
    : item.task;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function rawResultName(cell: EvaluationCell) {
  return `${slug(cell.provider)}__${slug(cell.model)}__${slug(cell.thinking)}__${cell.arm}__${slug(cell.case.id)}__r${String(cell.repetition).padStart(2, "0")}.json`;
}

export function contentKey(provenance: Record<string, unknown>) {
  const { packageCommit, packageDirty, packageTreeSha256, ...inputs } = provenance;
  return sha256(JSON.stringify(Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)))));
}

export function reportExitCode(report: { diagnosticSelection: boolean; selectionPassed: boolean; qualified: boolean }) {
  return (report.diagnosticSelection ? report.selectionPassed : report.qualified) ? 0 : 1;
}

export function attemptMetrics(attempts: Array<{ status: string; durationMs?: number; response?: { usage?: { totalTokens?: number; costUsd?: number } } }>) {
  return {
    attempts: attempts.length,
    attemptFailures: attempts.filter((attempt) => attempt.status !== "success").length,
    firstAttemptSucceeded: attempts[0]?.status === "success",
    totalTokens: attempts.reduce((sum, attempt) => sum + (attempt.response?.usage?.totalTokens ?? 0), 0),
    costUsd: attempts.reduce((sum, attempt) => sum + (attempt.response?.usage?.costUsd ?? 0), 0),
    durationMs: attempts.reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0),
  };
}

export function sha256(text: string | Buffer) {
  return createHash("sha256").update(text).digest("hex");
}
