#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { attemptMetrics, buildPrompt, contentKey, iterCells, rawResultName, reportExitCode, sha256, type EvaluationArm, type EvaluationCell, type EvaluationSpec } from "./lib/runner.ts";
import { aggregateResults, createEvaluationModelRuntime, createIsolatedAgentDir, runSdkCell } from "./lib/sdk-runner.ts";
import { classifyAttempt } from "./lib/jev-classifier.ts";
import { scoreOutcome } from "./lib/outcome.ts";
import { loadEvaluationSpec } from "./lib/spec.ts";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Args {
  arm: EvaluationArm | "both";
  thinking: string[];
  reportOnly: boolean;
  retryFailed: boolean;
  cases: string[];
  models: string[];
  repetitions?: number;
  maxCells?: number;
  resultsDir: string;
  judge: "deterministic" | "jev";
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    arm: "skill", thinking: [], reportOnly: false, retryFailed: false,
    cases: [], models: [], resultsDir: join(root, "evals", "results", "v2"), judge: "deterministic",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    const next = () => {
      const result = argv[++index];
      if (!result) throw new Error(`Missing value after ${value}`);
      return result;
    };
    if (value === "--report-only") args.reportOnly = true;
    else if (value === "--retry-failed") args.retryFailed = true;
    else if (value === "--arm") args.arm = next() as Args["arm"];
    else if (value === "--thinking") args.thinking.push(next());
    else if (value === "--case") args.cases.push(next());
    else if (value === "--model") args.models.push(next().replace(/^([^/:]+):/, "$1/"));
    else if (value === "--repetitions") args.repetitions = Number(next());
    else if (value === "--max-cells") args.maxCells = Number(next());
    else if (value === "--results-dir") args.resultsDir = resolve(next());
    else if (value === "--judge") args.judge = next() as Args["judge"];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!["skill", "baseline", "both"].includes(args.arm)) throw new Error(`Unknown arm: ${args.arm}`);
  if (!["deterministic", "jev"].includes(args.judge)) throw new Error(`Unknown judge: ${args.judge}`);
  if (args.thinking.some((level) => !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(level))) throw new Error("Unknown thinking level");
  args.thinking = [...new Set(args.thinking)];
  if (args.repetitions !== undefined && (!Number.isInteger(args.repetitions) || args.repetitions < 1)) throw new Error("--repetitions must be positive integer");
  if (args.maxCells !== undefined && (!Number.isInteger(args.maxCells) || args.maxCells < 1)) throw new Error("--max-cells must be positive integer");
  return args;
}

async function treeHash(path: string): Promise<string> {
  const hash = createHash("sha256");
  async function walk(current: string, prefix = "") {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(current, entry.name), relative);
      else hash.update(relative).update("\0").update(await readFile(join(current, entry.name))).update("\0");
    }
  }
  await walk(path);
  return hash.digest("hex");
}

async function provenance() {
  let commit: string | null = null;
  let dirty = true;
  try {
    commit = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    dirty = Boolean((await exec("git", ["status", "--porcelain"], { cwd: root })).stdout.trim());
  } catch { /* Content hashes remain authoritative outside a Git repository. */ }
  const piPackage = JSON.parse(await readFile(join(root, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), "utf8"));
  return {
    matrixSha256: sha256(await readFile(join(root, "evals", "matrix.json"))),
    casesSha256: sha256(await readFile(join(root, "evals", "cases.json"))),
    templatesSha256: sha256(await readFile(join(root, "evals", "fixtures", "templates.json"))),
    skillTreeSha256: await treeHash(join(root, "skills", "test-driven-development")),
    evalRunnerSha256: sha256(`${await readFile(join(root, "evals", "run-evals.ts"), "utf8")}\0${await treeHash(join(root, "evals", "lib"))}`),
    dependenciesSha256: sha256(await readFile(join(root, "package-lock.json"))),
    packageCommit: commit, packageDirty: dirty, piVersion: piPackage.version,
    nodeVersion: process.version, platform: process.platform, arch: process.arch,
  };
}

function selectCells(cells: EvaluationCell[], args: Args) {
  for (const id of args.cases) if (!cells.some((cell) => cell.case.id === id)) throw new Error(`Case unavailable in this track/arm: ${id}`);
  for (const id of args.models) if (!cells.some((cell) => `${cell.provider}/${cell.model}` === id)) throw new Error(`Model not in matrix: ${id}`);
  let selected = cells;
  if (args.cases.length) selected = selected.filter((cell) => args.cases.includes(cell.case.id));
  if (args.models.length) selected = selected.filter((cell) => args.models.includes(`${cell.provider}/${cell.model}`));
  if (args.repetitions !== undefined) selected = selected.filter((cell) => cell.repetition <= args.repetitions!);
  if (args.thinking.length) selected = selected.flatMap((cell) => args.thinking.map((thinking) => ({ ...cell, thinking })));
  selected = [...new Map(selected.map((cell) => [rawResultName(cell), cell])).values()];
  if (args.maxCells !== undefined) selected = selected.slice(0, args.maxCells);
  return selected;
}

async function writeAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function loadRaw(path: string) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
}

function sampleFromRaw(raw: any, path: string, judgment?: any) {
  const result = raw?.attempts?.at(-1);
  if (!result) return undefined;
  const outcome = judgment?.outcome ?? result.outcome;
  const reasons = Object.entries(outcome).filter(([key, value]) => key.endsWith("Passed") && value === false).map(([key]) => key);
  if (!outcome.supported) reasons.push(judgment?.error ?? judgment?.workflow?.reason ?? result.workflow?.reason ?? "workflow evidence unsupported; inspect raw trace");
  if (result.error) reasons.push(result.error);
  const userWorkPassed = raw.attempts.every((attempt: any) => attempt.outcome.userWorkPassed === true);
  if (!userWorkPassed) reasons.push("user work not preserved in at least one attempt");
  return {
    status: result.status,
    model: `${result.cell.provider}/${result.cell.model}:${result.cell.thinking}:${result.cell.arm}`,
    arm: result.cell.arm, repetition: result.cell.repetition,
    caseId: result.cell.caseId, invocation: result.cell.invocation,
    expectedLoaded: result.expectedLoaded, loaded: result.loaded,
    outcomePassed: outcome.passed, outcomeSupported: outcome.supported,
    artifactPassed: outcome.artifactPassed, userWorkPassed, judgment,
    ...attemptMetrics(raw.attempts), reasons, rawPath: path,
  };
}

async function writeReport(args: Args, selected: EvaluationCell[], provenanceValue: Awaited<ReturnType<typeof provenance>>, acceptance: EvaluationSpec["matrix"]["acceptance"]) {
  const cacheKey = contentKey(provenanceValue);
  const runDir = join(args.resultsDir, cacheKey);
  const samples = [];
  const missing: string[] = [];
  for (const cell of selected) {
    const name = rawResultName(cell);
    const path = join(runDir, "raw", name);
    const raw = await loadRaw(path);
    if (!raw || raw.cacheKey !== cacheKey) { missing.push(name); continue; }
    let judgment: unknown;
    if (args.judge === "jev" && raw.attempts?.length) {
      const result = raw.attempts.at(-1);
      const item = cell.case;
      if (result?.response && cell.arm === "skill" && item.expected.skill_loaded) {
        try {
          const classified = await classifyAttempt(result, item, join(args.resultsDir, "jev-cache"), process.env.TYPESAFE_API_KEY ?? "");
          const outcome = scoreOutcome({
            expected: item.expected, changedPaths: result.workspace.changedPaths, diff: result.workspace.diff,
            postcheck: result.postcheck, preservedWorking: result.preservedWorking,
            observedMode: classified.workflow.observedMode, observedLabel: classified.workflow.observedLabel,
            scopes: classified.workflow.scopes,
          });
          judgment = { ...classified, outcome };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Jev classification failed";
          judgment = { error: message, outcome: { ...result.outcome, passed: false, supported: false } };
        }
      } else if (cell.arm === "baseline" || !item.expected.skill_loaded) {
        judgment = { skipped: "No skill-specific workflow to classify", outcome: result?.outcome };
      } else judgment = { error: "No recorded response to classify", outcome: { ...result.outcome, passed: false, supported: false } };
    }
    const sample = sampleFromRaw(raw, path, judgment);
    if (sample) samples.push(sample);
    else missing.push(name);
  }
  const judgeSha256 = args.judge === "jev"
    ? sha256(`${await readFile(join(root, "evals", "lib", "jev-classifier.ts"), "utf8")}\0${await readFile(join(root, "evals", "jev", "judge.ts"), "utf8")}`)
    : null;
  const diagnosticSelection = args.arm !== "skill" || args.thinking.length > 0
    || args.cases.length > 0 || args.models.length > 0 || args.repetitions !== undefined || args.maxCells !== undefined;
  const recorded = missing.length === 0 && samples.length === selected.length;
  const aggregate = aggregateResults(samples, acceptance, !diagnosticSelection && recorded);
  const selectionPassed = recorded && samples.every((sample) => sample.status === "success" && sample.outcomePassed
    && sample.outcomeSupported && sample.userWorkPassed && sample.loaded === sample.expectedLoaded);
  const report = {
    schemaVersion: 2, generatedAt: new Date().toISOString(), arm: args.arm, judge: args.judge, judgeSha256,
    selectedCells: selected.length, recordedCells: samples.length, missing, diagnosticSelection,
    provenance: provenanceValue, cacheKey, aggregate, samples,
    attempts: samples.reduce((sum, sample) => sum + sample.attempts, 0),
    attemptFailures: samples.reduce((sum, sample) => sum + sample.attemptFailures, 0),
    totalTokens: samples.reduce((sum, sample) => sum + sample.totalTokens, 0),
    costUsd: samples.reduce((sum, sample) => sum + sample.costUsd, 0),
    executionComplete: recorded && samples.every((sample) => sample.status === "success"),
    selectionPassed,
    qualified: !diagnosticSelection && recorded && aggregate.complete && aggregate.accepted,
  };
  const selectionKey = sha256(`${judgeSha256 ? `jev:${judgeSha256}\n` : ""}${selected.map(rawResultName).sort().join("\n")}`).slice(0, 16);
  const reportPath = join(runDir, `report-${selectionKey}.json`);
  await writeAtomic(reportPath, report);
  await writeAtomic(join(args.resultsDir, "report.json"), report);
  const rows = samples.map((sample) => `| ${sample.model} | ${sample.caseId} / ${sample.repetition} | ${sample.loaded === sample.expectedLoaded ? "pass" : "FAIL"} | ${sample.artifactPassed ? "pass" : "FAIL"} | ${sample.outcomeSupported ? sample.outcomePassed ? "pass" : "FAIL" : "unsupported"} | ${sample.userWorkPassed ? "pass" : "FAIL"} | ${sample.attempts} | ${sample.totalTokens} | ${sample.reasons.join("; ").replaceAll("|", "\\|").replaceAll("\n", " ")} |`);
  const markdown = `# Pi TDD evaluation report\n\n- Arm: ${args.arm}; judge: ${args.judge}\n- Cells recorded: ${samples.length}/${selected.length}\n- Execution complete: ${report.executionComplete}\n- Selected cells all passed: ${selectionPassed}\n- Full matrix qualified: ${report.qualified}\n- Attempts: ${report.attempts}; failed attempts (including recovered): ${report.attemptFailures}\n- Total tokens: ${report.totalTokens}; provider-reported estimated cost: $${report.costUsd.toFixed(4)} (not subscription billing)\n\n${diagnosticSelection ? "Diagnostic selection; not a full qualification claim.\n\n" : ""}| Model / thinking / arm | Case / repetition | Routing | Artifact | Outcome | User work | Attempts | Tokens | Reasons |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\nMissing cells: ${missing.length}. Full traces and provenance: ${reportPath}\n`;
  await writeFile(reportPath.replace(/\.json$/, ".md"), markdown, "utf8");
  await writeFile(join(args.resultsDir, "report.md"), markdown, "utf8");
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = await loadEvaluationSpec(new URL("../", import.meta.url));
  if (args.repetitions !== undefined && args.repetitions > spec.matrix.repetitions) throw new Error("--repetitions exceeds the matrix");
  const selected = selectCells(iterCells(spec, args.arm), args);
  if (selected.length === 0) throw new Error("Selection contains no evaluation cells");
  const provenanceValue = await provenance();
  const cacheKey = contentKey(provenanceValue);
  const rawDir = join(args.resultsDir, cacheKey, "raw");

  if (!args.reportOnly) {
    const sourceAgentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
    const isolated = await createIsolatedAgentDir(sourceAgentDir);
    try {
      const modelRuntime = await createEvaluationModelRuntime(isolated.path);
      for (const cell of selected) {
        if (!modelRuntime.getModel(cell.provider, cell.model)) throw new Error(`Model unavailable: ${cell.provider}/${cell.model}`);
      }
      for (const [index, cell] of selected.entries()) {
        const path = join(rawDir, rawResultName(cell));
        const existing = await loadRaw(path);
        if (existing && existing.cacheKey === cacheKey && !(args.retryFailed && existing.attempts.at(-1)?.status === "failure")) {
          console.error(`[${index + 1}/${selected.length}] SKIP ${rawResultName(cell)}`);
          continue;
        }
        console.error(`[${index + 1}/${selected.length}] RUN ${rawResultName(cell)}`);
        const attempts = existing?.cacheKey === cacheKey ? [...existing.attempts] : [];
        for (let attempt = 0; attempt <= spec.matrix.retry_limit; attempt += 1) {
          const result = await runSdkCell(cell, spec, {
            isolatedAgentDir: isolated.path, modelRuntime, timeoutSeconds: spec.matrix.timeout_seconds,
          });
          attempts.push(result);
          await writeAtomic(path, {
            schemaVersion: 2, cacheKey, provenance: provenanceValue,
            promptSha256: sha256(buildPrompt(cell.case)), attempts,
          });
          if (result.status === "success") break;
        }
        if (index + 1 < selected.length) await new Promise((resolveDelay) => setTimeout(resolveDelay, spec.matrix.inter_call_delay_ms));
      }
    } finally { await isolated.cleanup(); }
  }

  const report = await writeReport(args, selected, provenanceValue, spec.matrix.acceptance);
  process.exitCode = reportExitCode(report);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 2;
});
