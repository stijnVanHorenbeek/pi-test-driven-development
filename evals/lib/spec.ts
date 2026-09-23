import { readFile } from "node:fs/promises";

export type Invocation = "automatic" | "explicit";
export type ExpectedMode = "tdd" | "regression-verification" | "preservation" | "validation-only" | "verification-limited";

export interface ExpectedScope {
  name: string;
  mode: ExpectedMode;
  paths: string[];
  command_pattern: string;
  red_output_pattern?: string;
}

export interface EvaluationCase {
  id: string;
  group: string;
  invocation: Invocation;
  template: string;
  task: string;
  base_files?: Record<string, string>;
  working_files?: Record<string, string>;
  expected: {
    skill_loaded: boolean;
    mode: ExpectedMode;
    test_change: "required" | "forbidden" | "optional";
    preserve_working?: string[];
    allowed_changed_paths?: string[];
    forbidden_patterns?: string[];
    red_output_pattern?: string;
    scopes?: ExpectedScope[];
  };
  postcheck: string[];
}

export interface FixtureTemplate {
  production_globs: string[];
  test_globs: string[];
  base_files: Record<string, string>;
}

export interface EvaluationAcceptance {
  automatic_positive_load_minimum_per_three: number;
  automatic_negative_load_maximum_per_three: number;
  explicit_load_minimum_per_three: number;
  workflow_outcome_minimum_per_three: number;
  user_work_preservation_required: boolean;
  unsupported_or_missing_cells_block_complete_claim: boolean;
}

export interface EvaluationMatrix {
  schema_version: number;
  models: Array<{ provider: string; model: string; thinking: string }>;
  repetitions: number;
  retry_limit: number;
  timeout_seconds: number;
  inter_call_delay_ms: number;
  system_prompt: string;
  isolation: Record<string, unknown>;
  acceptance: EvaluationAcceptance;
}

async function json<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

export async function loadEvaluationSpec(root: URL) {
  const matrix = await json<EvaluationMatrix>(new URL("evals/matrix.json", root));
  const caseDocument = await json<{ cases: EvaluationCase[] }>(new URL("evals/cases.json", root));
  const templateDocument = await json<{ templates: Record<string, FixtureTemplate> }>(new URL("evals/fixtures/templates.json", root));

  if (matrix.schema_version !== 1) throw new Error("Unsupported evaluation schema version");
  if (matrix.models.length < 2 || matrix.repetitions < 3) throw new Error("Matrix requires at least two models and three repetitions");
  if (new Set(caseDocument.cases.map(({ id }) => id)).size !== caseDocument.cases.length) throw new Error("Duplicate evaluation case id");
  for (const item of caseDocument.cases) {
    if (!templateDocument.templates[item.template]) throw new Error(`Unknown fixture template for ${item.id}: ${item.template}`);
    if (!Array.isArray(item.postcheck) || item.postcheck.length === 0) throw new Error(`Missing postcheck for ${item.id}`);
    const scopes = item.expected.scopes ?? [];
    if (new Set(scopes.map((scope) => scope.name.toLowerCase())).size !== scopes.length) throw new Error(`Duplicate scope in ${item.id}`);
    const paths = scopes.flatMap((scope) => scope.paths);
    if (new Set(paths).size !== paths.length) throw new Error(`Overlapping scope paths in ${item.id}`);
    for (const scope of scopes) {
      if (!scope.name || !scope.paths.length || !scope.command_pattern) throw new Error(`Incomplete scope in ${item.id}`);
      new RegExp(scope.command_pattern);
      if (scope.mode === "tdd" && !scope.red_output_pattern) throw new Error(`Missing scope red pattern in ${item.id}`);
    }
  }
  return { matrix, cases: caseDocument.cases, templates: templateDocument.templates };
}
