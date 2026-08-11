#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { buildPrompt, iterCells, rawResultName, type EvaluationCell, type EvaluationSpec, type EvaluationTrack } from "./lib/runner.ts";
import { aggregateResults, createEvaluationModelRuntime, createIsolatedAgentDir, runSdkCell } from "./lib/sdk-runner.ts";
import { loadEvaluationSpec } from "./lib/spec.ts";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Args {
  track: EvaluationTrack;
  reportOnly: boolean;
  cases: string[];
  models: string[];
  repetitions?: number;
  maxCells?: number;
  resultsDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    track: "tuning",
    reportOnly: false,
    cases: [],
    models: [],
    resultsDir: join(root, "evals", "results", "v1"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    const next = () => {
      const result = argv[++index];
      if (!result) throw new Error(`Missing value after ${value}`);
      return result;
    };
    if (value === "--report-only") args.reportOnly = true;
    else if (value === "--track") args.track = next() as EvaluationTrack;
    else if (value === "--case") args.cases.push(next());
    else if (value === "--model") args.models.push(next());
    else if (value === "--repetitions") args.repetitions = Number(next());
    else if (value === "--max-cells") args.maxCells = Number(next());
    else if (value === "--results-dir") args.resultsDir = resolve(next());
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!["tuning", "held-out", "all"].includes(args.track)) throw new Error(`Unknown track: ${args.track}`);
  if (args.repetitions !== undefined && (!Number.isInteger(args.repetitions) || args.repetitions < 1)) throw new Error("--repetitions must be positive integer");
  if (args.maxCells !== undefined && (!Number.isInteger(args.maxCells) || args.maxCells < 1)) throw new Error("--max-cells must be positive integer");
  return args;
}

async function sha256File(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function treeHash(path: string): Promise<string> {
  const hash = createHash("sha256");
  async function walk(current: string, prefix = "") {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(current, entry.name), relative);
      else {
        hash.update(relative);
        hash.update("\0");
        hash.update(await readFile(join(current, entry.name)));
        hash.update("\0");
      }
    }
  }
  await walk(path);
  return hash.digest("hex");
}

async function runtimePackageHash() {
  const hash = createHash("sha256");
  for (const file of ["package.json", "README.md", "LICENSE"]) {
    hash.update(file).update("\0").update(await readFile(join(root, file))).update("\0");
  }
  for (const directory of ["skills"]) {
    hash.update(directory).update("\0").update(await treeHash(join(root, directory))).update("\0");
  }
  return hash.digest("hex");
}

async function provenance() {
  let commit: string | null = null;
  let dirty = true;
  try {
    commit = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    dirty = Boolean((await exec("git", ["status", "--porcelain"], { cwd: root })).stdout.trim());
  } catch {
    // Initial uncommitted repository: tree hashes remain authoritative.
  }
  const piPackage = JSON.parse(await readFile(join(root, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), "utf8"));
  const runnerHash = createHash("sha256")
    .update(await readFile(join(root, "evals", "run-evals.ts")))
    .update(await treeHash(join(root, "evals", "lib")))
    .digest("hex");
  return {
    matrixSha256: await sha256File(join(root, "evals", "v1-matrix.json")),
    casesSha256: await sha256File(join(root, "evals", "cases.json")),
    templatesSha256: await sha256File(join(root, "evals", "fixtures", "templates.json")),
    skillTreeSha256: await treeHash(join(root, "skills", "test-driven-development")),
    packageTreeSha256: await runtimePackageHash(),
    evalRunnerSha256: runnerHash,
    packageCommit: commit,
    packageDirty: dirty,
    piVersion: piPackage.version,
  };
}

function selectCells(cells: EvaluationCell[], args: Args) {
  let selected = cells;
  if (args.cases.length > 0) selected = selected.filter((cell) => args.cases.includes(cell.case.id));
  if (args.models.length > 0) selected = selected.filter((cell) => args.models.includes(`${cell.provider}/${cell.model}`));
  if (args.repetitions !== undefined) selected = selected.filter((cell) => cell.repetition <= args.repetitions!);
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
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return undefined; }
}

function sampleFromRaw(raw: any) {
  const result = raw?.attempts?.at(-1);
  if (!result) return undefined;
  return {
    status: result.status,
    model: `${result.cell.provider}/${result.cell.model}:${result.cell.thinking}`,
    caseId: result.cell.caseId,
    invocation: result.cell.invocation,
    expectedLoaded: result.expectedLoaded,
    loaded: result.loaded,
    outcomePassed: result.outcome.passed,
    outcomeSupported: result.outcome.supported,
  };
}

async function writeReport(args: Args, selected: EvaluationCell[], provenanceValue: Awaited<ReturnType<typeof provenance>>, acceptance: EvaluationSpec["matrix"]["acceptance"]) {
  const rawDir = join(args.resultsDir, "raw");
  const samples = [];
  const missing: string[] = [];
  for (const cell of selected) {
    const name = rawResultName(cell);
    const raw = await loadRaw(join(rawDir, name));
    if (!raw || JSON.stringify(raw.provenance) !== JSON.stringify(provenanceValue)) {
      missing.push(name);
      continue;
    }
    const sample = sampleFromRaw(raw);
    if (sample) samples.push(sample);
    else missing.push(name);
  }
  const diagnosticSelection = args.track !== "all"
    || args.cases.length > 0
    || args.models.length > 0
    || args.repetitions !== undefined
    || args.maxCells !== undefined;
  const aggregate = aggregateResults(samples, acceptance, !diagnosticSelection && missing.length === 0 && samples.length === selected.length);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    track: args.track,
    selectedCells: selected.length,
    recordedCells: samples.length,
    missing,
    diagnosticSelection,
    provenance: provenanceValue,
    aggregate,
    complete: !diagnosticSelection && missing.length === 0 && aggregate.complete,
  };
  await writeAtomic(join(args.resultsDir, "report.json"), report);
  const markdown = `# Pi TDD evaluation report\n\n- Track: ${args.track}\n- Selected cells: ${selected.length}\n- Recorded cells: ${samples.length}\n- Missing/stale: ${missing.length}\n- Routing precision: ${aggregate.routing.precision ?? "n/a"}\n- Routing recall: ${aggregate.routing.recall ?? "n/a"}\n- Outcome passed: ${aggregate.outcomes.passed}\n- Outcome unsupported: ${aggregate.outcomes.unsupported}\n- Acceptance thresholds passed: ${aggregate.thresholds.passed ? "yes" : "no"}\n- Complete V1 claim: ${report.complete ? "yes" : "no"}\n\n${diagnosticSelection ? "Diagnostic subset only; cannot satisfy full matrix.\n" : ""}`;
  await writeFile(join(args.resultsDir, "report.md"), markdown, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = await loadEvaluationSpec(new URL("../", import.meta.url));
  const allCells = iterCells(spec, args.track);
  const selected = selectCells(allCells, args);
  if (selected.length === 0) throw new Error("Selection contains no evaluation cells");
  const provenanceValue = await provenance();
  const rawDir = join(args.resultsDir, "raw");

  if (!args.reportOnly) {
    const sourceAgentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
    const isolated = await createIsolatedAgentDir(sourceAgentDir);
    try {
      const modelRuntime = await createEvaluationModelRuntime(isolated.path);
      for (const [index, cell] of selected.entries()) {
        const path = join(rawDir, rawResultName(cell));
        const existing = await loadRaw(path);
        if (existing && JSON.stringify(existing.provenance) === JSON.stringify(provenanceValue)) {
          console.error(`[${index + 1}/${selected.length}] SKIP ${cell.case.id} ${cell.provider}/${cell.model} r${cell.repetition}`);
          continue;
        }
        console.error(`[${index + 1}/${selected.length}] RUN ${cell.case.id} ${cell.provider}/${cell.model}:${cell.thinking} r${cell.repetition}`);
        const attempts = [];
        for (let attempt = 0; attempt <= spec.matrix.retry_limit; attempt += 1) {
          const result = await runSdkCell(cell, spec, {
            isolatedAgentDir: isolated.path,
            modelRuntime,
            timeoutSeconds: spec.matrix.timeout_seconds,
          });
          attempts.push(result);
          if (result.status === "success") break;
        }
        await writeAtomic(path, {
          schemaVersion: 1,
          provenance: provenanceValue,
          promptSha256: createHash("sha256").update(buildPrompt(cell.case)).digest("hex"),
          attempts,
        });
        if (index + 1 < selected.length) await new Promise((resolveDelay) => setTimeout(resolveDelay, spec.matrix.inter_call_delay_ms));
      }
    } finally {
      await isolated.cleanup();
    }
  }

  const report = await writeReport(args, selected, provenanceValue, spec.matrix.acceptance);
  process.exitCode = report.complete ? 0 : 1;
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 2;
});
