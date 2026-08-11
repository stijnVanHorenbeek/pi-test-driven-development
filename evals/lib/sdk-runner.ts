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
import { scoreOutcome } from "./outcome.ts";
import { buildPrompt, type EvaluationCell, type EvaluationSpec } from "./runner.ts";
import { scoreRouting, type RoutingSample } from "./scoring.ts";
import type { EvaluationAcceptance, ExpectedMode } from "./spec.ts";

const exec = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillPath = join(packageRoot, "skills", "test-driven-development", "SKILL.md");
const skillRoot = dirname(skillPath);
const extensionPath = join(packageRoot, "extensions", "test-advisor.ts");

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

interface AdvisoryTimelineEntry {
  toolName: string;
  args?: any;
  resultText: string;
  resultMetadata?: Record<string, unknown>;
}

function parsedAdvisoryResults(timeline: AdvisoryTimelineEntry[]) {
  return [...timeline].reverse().flatMap((entry) => {
    if (entry.toolName !== "test_policy" && entry.toolName !== "test_status") return [];
    if (entry.resultMetadata) return [{ toolName: entry.toolName, value: entry.resultMetadata }];
    try { return [{ toolName: entry.toolName, value: JSON.parse(entry.resultText) as Record<string, unknown> }]; }
    catch { return []; }
  });
}

export function extractObservedMode(timeline: AdvisoryTimelineEntry[]): ExpectedMode | null {
  const labelModes: Record<string, ExpectedMode> = {
    "tdd-attested": "tdd",
    "regression-verified": "regression-verification",
    "preservation-verified": "preservation",
    "validation-only": "validation-only",
    "verification-limited": "verification-limited",
  };
  for (const { value } of parsedAdvisoryResults(timeline)) {
    const candidate = value.mode ?? value.decision;
    if (["tdd", "regression-verification", "preservation", "validation-only", "verification-limited"].includes(String(candidate))) {
      return candidate as ExpectedMode;
    }
    const fromLabel = labelModes[String(value.supportedLabel)];
    if (fromLabel) return fromLabel;
  }
  return null;
}

type ObservedLabel = "tdd-attested" | "regression-verified" | "preservation-verified" | "validation-only" | "verification-limited";

function clearlyReadOnlyBash(entry: AdvisoryTimelineEntry) {
  if (entry.toolName !== "bash" || typeof entry.args?.command !== "string") return false;
  const segments = entry.args.command.split(/&&|\|\||;/).map((segment: string) => segment.trim()).filter(Boolean);
  return segments.length > 0 && segments.every((segment: string) => /^git\s+(?:diff|status|show|log|rev-parse)\b/.test(segment));
}

export function extractObservedLabel(timeline: AdvisoryTimelineEntry[]): ObservedLabel | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index]!;
    if (entry.toolName !== "test_status") continue;
    const parsed = parsedAdvisoryResults([entry]).at(0)?.value;
    const candidate = parsed?.supportedLabel;
    if (!["tdd-attested", "regression-verified", "preservation-verified", "validation-only", "verification-limited"].includes(String(candidate))) continue;
    if (candidate === "verification-limited") return candidate;
    const stale = timeline.slice(index + 1).some((later) =>
      ["edit", "write", "test_run", "test_policy"].includes(later.toolName)
      || (later.toolName === "bash" && !clearlyReadOnlyBash(later)),
    );
    return stale ? null : candidate as ObservedLabel;
  }
  return null;
}

interface OrderedTimelineEntry extends AdvisoryTimelineEntry {
  sequence: number;
  args?: any;
  resultMetadata?: Record<string, unknown>;
}

function testPath(path: unknown) {
  if (typeof path !== "string") return false;
  const value = path.replaceAll("\\", "/").toLowerCase();
  return /(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(value)
    || /\.(test|spec)\.[a-z0-9]+$/.test(value)
    || value.endsWith(".snap");
}

function testCommand(entry: OrderedTimelineEntry) {
  if (entry.toolName === "test_run") {
    const exitCode = entry.resultMetadata?.exitCode;
    return typeof exitCode === "number" ? {
      sequence: entry.sequence,
      exitCode,
      phase: String(entry.resultMetadata?.phase ?? ""),
      valid: entry.resultMetadata?.valid === true,
      advisory: true,
    } : undefined;
  }
  if (entry.toolName !== "bash" || typeof entry.args?.command !== "string") return undefined;
  if (!/(?:^|\s)(?:npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|bun\s+test|node\s+--test|pytest|go\s+test|cargo\s+test|rspec|vitest|jest|gradlew?.*\btest|mvn.*\btest|dotnet\s+test|mix\s+test|phpunit|swift\s+test|dart\s+test|flutter\s+test|ctest)\b/i.test(entry.args.command)) return undefined;
  const failure = entry.resultText.match(/Command exited with code (\d+)/);
  return { sequence: entry.sequence, exitCode: failure ? Number(failure[1]) : 0, phase: "", valid: !failure, advisory: false };
}

export function inferObservedLabel(timeline: OrderedTimelineEntry[], mode: ExpectedMode | null): ObservedLabel | null {
  if (timeline.some((entry) => entry.toolName === "test_status")) return extractObservedLabel(timeline);
  if (mode === "verification-limited") return "verification-limited";
  const mutations = timeline
    .filter((entry) => (entry.toolName === "edit" || entry.toolName === "write") && typeof entry.args?.path === "string")
    .map((entry) => ({ sequence: entry.sequence, test: testPath(entry.args.path) }));
  const runs = timeline.map(testCommand).filter((value): value is NonNullable<ReturnType<typeof testCommand>> => Boolean(value));
  const firstProduction = mutations.find((mutation) => !mutation.test);
  const firstTest = mutations.find((mutation) => mutation.test);
  const latestMutation = mutations.at(-1);

  if (mode === "tdd" && firstTest && latestMutation) {
    const red = runs.find((run) => run.advisory && run.phase === "red" && run.valid && run.sequence > firstTest.sequence);
    const production = red && mutations.find((mutation) => !mutation.test && mutation.sequence > red.sequence);
    const green = production && runs.find((run) => run.sequence > latestMutation.sequence && run.exitCode === 0);
    return red && production && green ? "tdd-attested" : null;
  }
  if (mode === "preservation" && firstProduction && latestMutation) {
    const baseline = runs.find((run) => run.sequence < firstProduction.sequence && run.exitCode === 0);
    const post = runs.find((run) => run.sequence > latestMutation.sequence && run.exitCode === 0);
    return baseline && post ? "preservation-verified" : null;
  }
  if (mode === "regression-verification") {
    return runs.some((run) => (!latestMutation || run.sequence > latestMutation.sequence) && run.exitCode === 0) ? "regression-verified" : null;
  }
  if (mode === "validation-only") {
    return runs.some((run) => run.advisory && run.phase === "validation" && run.valid && (!latestMutation || run.sequence > latestMutation.sequence)) ? "validation-only" : null;
  }
  return null;
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
    additionalExtensionPaths: [extensionPath],
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
    const extensionResult = loader.getExtensions();
    if (extensionResult.errors.length > 0) throw new Error(`Extension load failed: ${extensionResult.errors.map((item) => item.error).join("; ")}`);
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
  const observedMode = extractObservedMode(summary?.timeline ?? []);
  const observedLabel = extractObservedLabel(summary?.timeline ?? [])
    ?? inferObservedLabel(summary?.timeline ?? [], observedMode);
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
