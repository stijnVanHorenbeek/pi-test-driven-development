import type { EvaluationCase, ExpectedMode } from "./spec.ts";

interface PostcheckResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface OutcomeInput {
  expected: EvaluationCase["expected"];
  changedPaths: string[];
  diff: string;
  postcheck: PostcheckResult;
  preservedWorking: Record<string, boolean>;
  observedMode: ExpectedMode | null;
  observedLabel?: "tdd-attested" | "regression-verified" | "preservation-verified" | "validation-only" | "verification-limited" | null;
  scopes?: Array<{ name: string; observedMode: ExpectedMode | null; observedLabel: OutcomeInput["observedLabel"] }>;
}

export function isTestPath(path: string) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return /(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(normalized)
    || /\.(test|spec)\.[a-z0-9]+$/.test(normalized)
    || /(^|\/)(?:test_[^/]+|[^/]+_(?:test|spec))\.[a-z0-9]+$/.test(normalized)
    || normalized.endsWith(".snap");
}

export function scoreOutcome(input: OutcomeInput) {
  const testChanged = input.changedPaths.some(isTestPath);
  const testChangePassed = input.expected.test_change === "required"
    ? testChanged
    : input.expected.test_change === "forbidden"
      ? !testChanged
      : true;
  const forbiddenHits: string[] = [];
  for (const pattern of input.expected.forbidden_patterns ?? []) {
    if (new RegExp(pattern, "i").test(`${input.diff}\n${input.changedPaths.join("\n")}`)) forbiddenHits.push(pattern);
  }
  const forbiddenPatternsPassed = forbiddenHits.length === 0;
  const unexpectedChangedPaths = input.expected.allowed_changed_paths
    ? input.changedPaths.filter((path) => !input.expected.allowed_changed_paths!.includes(path))
    : [];
  const allowedChangedPathsPassed = unexpectedChangedPaths.length === 0;
  const artifactPassed = input.postcheck.exitCode === 0;
  const userWorkPassed = Object.values(input.preservedWorking).every(Boolean);
  let modePassed = input.expected.skill_loaded
    ? input.observedMode === null ? null : input.observedMode === input.expected.mode
    : null;
  const expectedLabel = {
    tdd: "tdd-attested",
    "regression-verification": "regression-verified",
    preservation: "preservation-verified",
    "validation-only": "validation-only",
    "verification-limited": "verification-limited",
  }[input.expected.mode];
  let labelPassed = input.expected.skill_loaded
    ? input.observedLabel == null ? null : input.observedLabel === expectedLabel
    : null;
  if (input.expected.skill_loaded && input.expected.scopes?.length) {
    const scopes = input.expected.scopes.map((expected) => {
      const matches = input.scopes?.filter((scope) => scope.name === expected.name) ?? [];
      const actual = matches.length === 1 ? matches[0] : undefined;
      return actual?.observedLabel && actual.observedMode ? actual.observedMode === expected.mode : null;
    });
    modePassed = scopes.some((passed) => passed === null) ? null : scopes.every(Boolean);
    labelPassed = modePassed;
  }
  const supported = !input.expected.skill_loaded || (modePassed !== null && labelPassed !== null);
  return {
    passed: artifactPassed && testChangePassed && forbiddenPatternsPassed && allowedChangedPathsPassed && userWorkPassed && modePassed !== false && labelPassed !== false,
    supported,
    artifactPassed,
    testChanged,
    testChangePassed,
    forbiddenPatternsPassed,
    forbiddenHits,
    allowedChangedPathsPassed,
    unexpectedChangedPaths,
    userWorkPassed,
    modePassed,
    expectedMode: input.expected.mode,
    observedMode: input.observedMode,
    expectedLabel,
    observedLabel: input.observedLabel ?? null,
    labelPassed,
    postcheck: input.postcheck,
  };
}
