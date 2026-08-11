import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { EventEvidence } from "./events.ts";
import { createFixtureRepository } from "./fixtures.ts";
import { isTestPath, scoreOutcome } from "./outcome.ts";
import { buildPrompt, type EvaluationCell, type EvaluationSpec } from "./runner.ts";
import { scoreRouting, type RoutingSample } from "./scoring.ts";
import type { EvaluationAcceptance, ExpectedMode } from "./spec.ts";

const exec = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillPath = join(packageRoot, "skills", "test-driven-development", "SKILL.md");
const skillRoot = dirname(skillPath);
async function exists(path: string) {
  try { await stat(path); return true; } catch { return false; }
}

export async function createIsolatedAgentDir(sourceAgentDir: string) {
  const path = await mkdtemp(join(tmpdir(), "pi-tdd-agent-"));
  for (const name of ["auth.json", "models-store.json"]) {
    const source = join(sourceAgentDir, name);
    if (await exists(source)) await copyFile(source, join(path, name));
  }
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
}

interface TimelineEntry {
  sequence: number;
  completionSequence?: number;
  toolName: string;
  args?: any;
  isError?: boolean;
  resultText: string;
}

type ObservedLabel = "tdd-attested" | "regression-verified" | "preservation-verified" | "validation-only" | "verification-limited";

const labelModes: Record<ObservedLabel, ExpectedMode> = {
  "tdd-attested": "tdd",
  "regression-verified": "regression-verification",
  "preservation-verified": "preservation",
  "validation-only": "validation-only",
  "verification-limited": "verification-limited",
};

function claimedLabel(finalText: string): ObservedLabel | null {
  const matches = [...finalText.matchAll(/\bEvidence(?: label)?\s*:\s*`?(tdd-attested|regression-verified|preservation-verified|validation-only|verification-limited)\b/gi)];
  return (matches.at(-1)?.[1]?.toLowerCase() as ObservedLabel | undefined) ?? null;
}

function commandExitCode(entry: TimelineEntry) {
  if (entry.completionSequence === undefined) return null;
  const failure = entry.resultText.match(/Command exited with code (\d+)/i);
  if (failure) return Number(failure[1]);
  return entry.isError ? null : 0;
}

function hasShellComposition(command: string) {
  const unquoted = command.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "");
  return /[\r\n]|&&|\|\||[;|]|(?:^|[^>])&(?![&>\d])/.test(unquoted);
}

function testCommand(entry: TimelineEntry) {
  if (entry.toolName !== "bash" || typeof entry.args?.command !== "string" || hasShellComposition(entry.args.command)) return undefined;
  if (!/^\s*(?:npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|bun\s+test|node\s+--test|python(?:3(?:\.\d+)?)?\s+-m\s+unittest|pytest|go\s+test|cargo\s+test|rspec|vitest|jest|\.\/gradlew.*\btest|gradle\s+test|mvn.*\btest|\.\/mvnw.*\btest|dotnet\s+test|mix\s+test|phpunit|swift\s+test|dart\s+test|flutter\s+test|ctest)\b/i.test(entry.args.command)) return undefined;
  return {
    sequence: entry.sequence,
    completionSequence: entry.completionSequence ?? entry.sequence,
    exitCode: commandExitCode(entry),
    output: entry.resultText,
  };
}

function setupFailure(output: string) {
  return /\b(?:cannot find (?:module|package)|module not found|err_module_not_found|command not found|no such file|cannot resolve|failed to load)\b/i.test(output)
    || (/SyntaxError:/i.test(output) && !/does not provide an export named/i.test(output));
}

function hasOpaqueShellSyntax(command: string) {
  return /\$\(|`/.test(command)
    || /(?:^|[\s;&|])(?:\d*)>>?\s*(?!\/dev\/null\b|&\d+\b)/.test(command);
}

function looksLikeOpaqueMutation(command: string) {
  return hasOpaqueShellSyntax(command)
    || /(?:^|[;&|])\s*(?:sed\s+-i|perl\s+-pi|tee\s|mv\s|cp\s|rm\s|touch\s|truncate\s|dd\s|rsync\s|git\s+(?:commit|reset|restore|clean|apply|checkout|switch)\b)/.test(command)
    || /^\s*(?:(?:python\d*|ruby|bash|sh|zsh|fish)\b|node\s+(?!--test\b)|\.\/\S+)/.test(command);
}

function failureDiagnostics(output: string) {
  return output.split("\n")
    .filter((line) => !/^\s*(?:✔|✓|ok\b|pass\b)/i.test(line))
    .join("\n");
}

function samePath(left: unknown, right: unknown) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const normalize = (value: string) => value.replace(/^@/, "").replaceAll("\\", "/").replace(/^\.\//, "");
  const a = normalize(left);
  const b = normalize(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function knownCommandMutation(entry: TimelineEntry) {
  if (entry.toolName !== "bash" || entry.completionSequence === undefined || entry.isError) return undefined;
  const command = typeof entry.args?.command === "string" ? entry.args.command : "";
  if (hasShellComposition(command) || !/^\s*go\s+mod\s+edit\b/.test(command)) return undefined;
  if (!/(?:^|\s)-(?:fmt\b|go=|module=|toolchain=|require=|droprequire=|exclude=|dropexclude=|replace=|dropreplace=|tool=|droptool=)/.test(command)) return undefined;
  return {
    sequence: entry.sequence,
    completionSequence: entry.completionSequence,
    path: "go.mod",
    test: false,
  };
}

function successfulVerification(entry: TimelineEntry, changedPaths: string[]) {
  if (entry.sequence < 1 || entry.completionSequence === undefined || entry.isError) return false;
  if (entry.toolName === "read") return changedPaths.some((path) => samePath(path, entry.args?.path));
  if (entry.toolName !== "bash" || typeof entry.args?.command !== "string") return false;
  const command = entry.args.command;
  const recognized = /^\s*(?:git\s+diff\b|npm\s+(?:test|pack(?=\s+[^\n]*--dry-run\b)|run\s+(?:test|check|build|lint|typecheck))\b|pnpm\s+(?:test|check|build|lint|typecheck)\b|yarn\s+(?:test|check|build|lint|typecheck)\b|bun\s+(?:test|run\s+(?:test|check|build|lint|typecheck))\b|tsc\b|pytest\b|go\s+(?:test\b|mod\s+(?:edit\s+-json\b|tidy\s+-diff\b)|list\s+-m\b)|cargo\s+test\b|rspec\b|vitest\b|jest\b|dotnet\s+test\b|mix\s+test\b|phpunit\b|swift\s+test\b|dart\s+test\b|flutter\s+test\b|ctest\b)/i.test(command);
  return recognized && !hasShellComposition(command) && commandExitCode(entry) === 0 && !looksLikeOpaqueMutation(command);
}

export function inferObservedWorkflow(timeline: TimelineEntry[], finalText: string, expectedRedPattern?: string) {
  const claim = claimedLabel(finalText);
  const mode = claim ? labelModes[claim] : null;
  if (!claim || !mode) return { claimedLabel: claim, observedMode: mode, observedLabel: null };

  const opaqueMutation = timeline.some((entry) =>
    entry.toolName === "bash"
    && typeof entry.args?.command === "string"
    && (
      hasOpaqueShellSyntax(entry.args.command)
      || (!testCommand(entry) && looksLikeOpaqueMutation(entry.args.command))
    ),
  );
  if (opaqueMutation && claim !== "verification-limited") {
    return { claimedLabel: claim, observedMode: mode, observedLabel: null };
  }

  const mutations = timeline.flatMap((entry) => {
    if (
      (entry.toolName === "edit" || entry.toolName === "write")
      && entry.completionSequence !== undefined
      && typeof entry.args?.path === "string"
      && !entry.isError
    ) {
      return [{
        sequence: entry.sequence,
        completionSequence: entry.completionSequence,
        path: String(entry.args.path),
        test: isTestPath(String(entry.args.path)),
      }];
    }
    const mutation = knownCommandMutation(entry);
    return mutation ? [mutation] : [];
  });
  const runs = timeline.map(testCommand).filter((value): value is NonNullable<ReturnType<typeof testCommand>> => Boolean(value));
  const firstProduction = mutations.find((mutation) => !mutation.test);
  const firstTest = mutations.find((mutation) => mutation.test);
  const latestMutation = mutations.reduce<(typeof mutations)[number] | undefined>(
    (latest, mutation) => !latest || mutation.completionSequence > latest.completionSequence ? mutation : latest,
    undefined,
  );
  let observedLabel: ObservedLabel | null = null;

  if (claim === "tdd-attested" && firstTest && latestMutation && expectedRedPattern) {
    let expectedRed: RegExp | undefined;
    try { expectedRed = new RegExp(expectedRedPattern, "i"); } catch { /* invalid evaluation pattern stays unsupported */ }
    const red = expectedRed && runs.find((run) =>
      run.sequence > firstTest.completionSequence
      && run.exitCode !== null
      && run.exitCode !== 0
      && !setupFailure(run.output)
      && expectedRed.test(failureDiagnostics(run.output)),
    );
    const production = red && mutations.find((mutation) => !mutation.test && mutation.sequence > red.completionSequence);
    const green = production && runs.find((run) => run.sequence > latestMutation.completionSequence && run.exitCode === 0);
    if (red && production && green && firstProduction === production) observedLabel = claim;
  } else if (claim === "preservation-verified" && firstProduction && latestMutation) {
    const baseline = runs.find((run) => run.completionSequence < firstProduction.sequence && run.exitCode === 0);
    const post = runs.find((run) => run.sequence > latestMutation.completionSequence && run.exitCode === 0);
    if (baseline && post) observedLabel = claim;
  } else if (claim === "regression-verified" && firstTest && latestMutation && !firstProduction) {
    const regression = runs.find((run) => run.sequence > latestMutation.completionSequence && run.exitCode === 0);
    if (regression) observedLabel = claim;
  } else if ((claim === "validation-only" || claim === "verification-limited") && latestMutation) {
    const validation = timeline.find((entry) =>
      entry.sequence > latestMutation.completionSequence
      && successfulVerification(entry, mutations.map(({ path }) => path)),
    );
    const limitedGap = claim !== "verification-limited" || /\b(?:residual|unverified|gap|unavailable|unsafe|cannot|could not)\b/i.test(finalText);
    if (validation && limitedGap && (claim === "verification-limited" || !firstTest)) observedLabel = claim;
  }

  return { claimedLabel: claim, observedMode: mode, observedLabel };
}

export interface AggregateSample {
  status: "success" | "failure";
  model: string;
  caseId: string;
  invocation: "automatic" | "explicit";
  expectedLoaded: boolean;
  loaded: boolean;
  outcomePassed: boolean;
  outcomeSupported: boolean;
}

export function aggregateResults(samples: AggregateSample[], acceptance: EvaluationAcceptance, eligible = true) {
  const routingSamples: RoutingSample[] = samples.map((sample) => ({
    model: sample.model,
    caseId: sample.caseId,
    expected: sample.expectedLoaded,
    loaded: sample.loaded,
    status: sample.status,
  }));
  const routing = scoreRouting(routingSamples);
  const successful = samples.filter(({ status }) => status === "success");
  const failures = samples.length - successful.length;
  const outcomes = {
    passed: successful.filter(({ outcomePassed }) => outcomePassed).length,
    failed: successful.filter(({ outcomePassed }) => !outcomePassed).length,
    supported: successful.filter(({ outcomeSupported }) => outcomeSupported).length,
    unsupported: successful.filter(({ outcomeSupported }) => !outcomeSupported).length,
  };
  const workflowSuccess = (sample: AggregateSample) => sample.status === "success" && sample.outcomePassed && sample.outcomeSupported;
  const checks: Array<{ metric: string; scope: string; actual: number; required: number; comparison: "minimum" | "maximum" | "exact"; passed: boolean }> = [];
  const groups = new Map<string, AggregateSample[]>();
  for (const sample of samples) {
    const key = `${sample.model}\u0000${sample.caseId}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    const scope = `${first.model}/${first.caseId}`;
    checks.push({ metric: "repetitions", scope, actual: group.length, required: 3, comparison: "exact", passed: group.length === 3 });
    const loaded = group.filter((sample) => sample.status === "success" && sample.loaded).length;
    if (first.invocation === "explicit") {
      const required = acceptance.explicit_load_minimum_per_three;
      checks.push({ metric: "explicit_load", scope, actual: loaded, required, comparison: "minimum", passed: loaded >= required });
    } else if (first.expectedLoaded) {
      const required = acceptance.automatic_positive_load_minimum_per_three;
      checks.push({ metric: "automatic_positive_load", scope, actual: loaded, required, comparison: "minimum", passed: loaded >= required });
    } else {
      const required = acceptance.automatic_negative_load_maximum_per_three;
      checks.push({ metric: "automatic_negative_load", scope, actual: loaded, required, comparison: "maximum", passed: loaded <= required });
    }
    const workflow = group.filter(workflowSuccess).length;
    const required = acceptance.workflow_outcome_minimum_per_three;
    checks.push({ metric: "workflow_outcome", scope, actual: workflow, required, comparison: "minimum", passed: workflow >= required });
  }
  const thresholds = { eligible, passed: eligible && checks.length > 0 && checks.every(({ passed }) => passed), checks };
  return {
    cells: samples.length,
    failures,
    routing,
    outcomes,
    thresholds,
    complete: failures === 0
      && routing.complete
      && (!acceptance.unsupported_or_missing_cells_block_complete_claim || outcomes.unsupported === 0)
      && outcomes.failed === 0
      && thresholds.passed,
  };
}

async function git(root: string, args: string[]) {
  return exec("git", args, { cwd: root, maxBuffer: 4_000_000 });
}

function statusEntries(output: string) {
  const entries: Array<{ status: string; path: string }> = [];
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    entries.push({ status, path: record.slice(3) });
    if (/[RC]/.test(status)) index += 1;
  }
  return entries;
}

async function hash(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function workspaceEvidence(root: string, baselineCommit: string) {
  const statusOutput = (await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout;
  const entries = statusEntries(statusOutput);
  const status = entries.map((entry) => `${entry.status} ${JSON.stringify(entry.path)}`).join("\n");
  const tracked = (await git(root, ["diff", "--name-only", "-z", baselineCommit, "--"])).stdout.split("\0").filter(Boolean);
  const changedPaths = [...new Set([...tracked, ...entries.map(({ path }) => path)])].sort();
  let diff = (await git(root, ["diff", "--no-ext-diff", baselineCommit, "--"])).stdout;
  for (const { path } of entries.filter((entry) => entry.status === "??")) {
    const content = await readFile(join(root, path), "utf8").catch(() => "<binary or unreadable>");
    diff += `\n--- /dev/null\n+++ b/${path}\n${content.slice(0, 20_000)}`;
  }
  return { status, changedPaths, diff: diff.slice(0, 200_000), diffTruncated: diff.length > 200_000 };
}

async function postcheck(root: string, command: string[]) {
  try {
    const { stdout, stderr } = await exec(command[0]!, command.slice(1), {
      cwd: root,
      timeout: 30_000,
      maxBuffer: 1_000_000,
    });
    return { exitCode: 0, stdout: stdout.slice(-20_000), stderr: stderr.slice(-20_000) };
  } catch (error: any) {
    return {
      exitCode: typeof error?.code === "number" ? error.code : null,
      stdout: String(error?.stdout ?? "").slice(-20_000),
      stderr: String(error?.stderr ?? error?.message ?? "").slice(-20_000),
    };
  }
}

function exactPackageSkill(resources: ReturnType<DefaultResourceLoader["getSkills"]>) {
  return resources.skills.filter((skill) => resolve(skill.filePath) === resolve(skillPath));
}

export interface RunSdkCellOptions {
  isolatedAgentDir: string;
  modelRuntime: ModelRuntime;
  timeoutSeconds: number;
}

export async function runSdkCell(
  cell: EvaluationCell,
  spec: EvaluationSpec,
  options: RunSdkCellOptions,
) {
  const fixture = await createFixtureRepository(cell.case, spec.templates[cell.case.template]);
  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: "never",
    enableInstallTelemetry: false,
    enableSkillCommands: true,
    packages: [],
    extensions: [],
    skills: [],
    prompts: [],
    themes: [],
    retry: { enabled: false },
    compaction: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd: fixture.path,
    agentDir: options.isolatedAgentDir,
    settingsManager,
    additionalSkillPaths: [skillRoot],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: spec.matrix.system_prompt,
    skillsOverride: (base) => ({
      skills: exactPackageSkill(base),
      diagnostics: base.diagnostics,
    }),
    promptsOverride: (base) => ({ prompts: [], diagnostics: base.diagnostics }),
    themesOverride: (base) => ({ themes: [], diagnostics: base.diagnostics }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });

  let status: "success" | "failure" = "success";
  let error: string | undefined;
  let preflightAccepted = false;
  let summary: ReturnType<EventEvidence["summary"]> | undefined;
  const started = performance.now();
  try {
    await loader.reload();
    const skills = exactPackageSkill(loader.getSkills());
    if (skills.length !== 1) throw new Error(`Expected one package skill, found ${skills.length}`);
    const model = options.modelRuntime.getModel(cell.provider, cell.model);
    if (!model) throw new Error(`Model unavailable: ${cell.provider}/${cell.model}`);
    const { session } = await createAgentSession({
      cwd: fixture.path,
      agentDir: options.isolatedAgentDir,
      modelRuntime: options.modelRuntime,
      model,
      thinkingLevel: cell.thinking as any,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(fixture.path),
      settingsManager,
      sessionStartEvent: { type: "session_start", reason: "startup" },
    });
    const evidence = new EventEvidence(skillPath, { maxResultChars: 10_000 });
    const unsubscribe = session.subscribe((event) => evidence.consume(event));
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        session.prompt(buildPrompt(cell.case), {
          preflightResult: (accepted) => { preflightAccepted = accepted; },
        }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            void session.abort();
            reject(new Error(`Cell timed out after ${options.timeoutSeconds}s`));
          }, options.timeoutSeconds * 1000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      unsubscribe();
      summary = evidence.summary();
      session.dispose();
    }
  } catch (caught) {
    status = "failure";
    error = caught instanceof Error ? caught.message : String(caught);
  }
  if (status === "success" && summary) {
    if (!summary.finalText.trim()) {
      status = "failure";
      error = summary.errorMessage || `Model returned no final text (stop reason: ${summary.stopReason ?? "unknown"}).`;
    } else if (summary.stopReason && summary.stopReason !== "stop") {
      status = "failure";
      error = summary.errorMessage || `Unexpected model stop reason: ${summary.stopReason}`;
    } else if (summary.provider !== cell.provider || summary.model !== cell.model) {
      status = "failure";
      error = `Model identity mismatch: expected ${cell.provider}/${cell.model}, got ${summary.provider}/${summary.model}.`;
    }
  }

  const workspace = await workspaceEvidence(fixture.path, fixture.baselineCommit);
  const preservedWorking: Record<string, boolean> = {};
  for (const path of cell.case.expected.preserve_working ?? []) {
    const before = fixture.preservedWorkingHashes[path];
    preservedWorking[path] = Boolean(before) && await hash(join(fixture.path, path)).catch(() => "missing") === before;
  }
  const postcheckResult = await postcheck(fixture.path, cell.case.postcheck);
  const observed = inferObservedWorkflow(
    summary?.timeline ?? [],
    summary?.finalText ?? "",
    cell.case.expected.red_output_pattern,
  );
  const observedMode = observed.observedMode;
  const observedLabel = observed.observedLabel;
  const outcome = scoreOutcome({
    expected: cell.case.expected,
    changedPaths: workspace.changedPaths,
    diff: workspace.diff,
    postcheck: postcheckResult,
    preservedWorking,
    observedMode,
    observedLabel,
  });
  const explicitResolved = cell.case.invocation === "explicit" && preflightAccepted && exactPackageSkill(loader.getSkills()).length === 1;
  const loaded = cell.case.invocation === "explicit" ? explicitResolved : Boolean(summary?.skillLoaded);
  const result = {
    schemaVersion: 1,
    status,
    error,
    cell: {
      provider: cell.provider,
      model: cell.model,
      thinking: cell.thinking,
      repetition: cell.repetition,
      caseId: cell.case.id,
      invocation: cell.case.invocation,
    },
    durationMs: Math.round(performance.now() - started),
    expectedLoaded: cell.case.expected.skill_loaded,
    loaded,
    preflightAccepted,
    routing: summary ? {
      skillLoadedByRead: summary.skillLoaded,
      skillEntrypointReads: summary.skillEntrypointReads,
      skillTreeReads: summary.skillTreeReads,
      failedReads: summary.failedReads,
      explicitResolved,
    } : undefined,
    response: summary ? {
      finalText: summary.finalText,
      provider: summary.provider,
      model: summary.model,
      usage: summary.usage,
      stopReason: summary.stopReason,
      errorMessage: summary.errorMessage,
      timeline: summary.timeline,
    } : undefined,
    workspace,
    preservedWorking,
    postcheck: postcheckResult,
    observedMode,
    observedLabel,
    outcome,
  };
  await fixture.cleanup();
  return result;
}

export async function createEvaluationModelRuntime(isolatedAgentDir: string) {
  return ModelRuntime.create({
    authPath: join(isolatedAgentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(isolatedAgentDir, "models-store.json"),
    allowModelNetwork: false,
    refreshOnCreate: true,
  });
}
