import { createHash } from "node:crypto";

import type { EvaluationCase } from "./spec.ts";
import type { loadEvaluationSpec } from "./spec.ts";

export type EvaluationSpec = Awaited<ReturnType<typeof loadEvaluationSpec>>;
export type EvaluationTrack = "tuning" | "held-out" | "all";

export interface EvaluationCell {
  provider: string;
  model: string;
  thinking: string;
  repetition: number;
  case: EvaluationCase;
}

export function iterCells(spec: EvaluationSpec, track: EvaluationTrack): EvaluationCell[] {
  const cases = spec.cases.filter((item) =>
    track === "all" || (track === "held-out" ? item.held_out : !item.held_out),
  );
  return spec.matrix.models.flatMap((model) =>
    cases.flatMap((item) =>
      Array.from({ length: spec.matrix.repetitions }, (_, index) => ({
        ...model,
        repetition: index + 1,
        case: item,
      })),
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
  return `${slug(cell.provider)}__${slug(cell.model)}__${slug(cell.thinking)}__${slug(cell.case.id)}__r${String(cell.repetition).padStart(2, "0")}.json`;
}

export function sha256(text: string | Buffer) {
  return createHash("sha256").update(text).digest("hex");
}
