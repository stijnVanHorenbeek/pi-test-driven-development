import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ignored = new Set([".git", "node_modules", "vendor", "target", "dist", "build", ".venv", "venv", ".tox", ".dart_tool", "__pycache__"]);
const manifestNames = new Set(["package.json", "pyproject.toml", "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "mix.exs", "composer.json", "Package.swift", "pubspec.yaml", "MODULE.bazel", "WORKSPACE", "WORKSPACE.bazel", "CMakeLists.txt", "Makefile", "justfile", "Justfile", "Taskfile.yml", "Taskfile.yaml"]);
const lockfileNames = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "uv.lock", "poetry.lock", "Cargo.lock", "Gemfile.lock", "composer.lock", "pubspec.lock"]);
const testConfigNames = new Set(["pytest.ini", "tox.ini", "noxfile.py", ".rspec", "phpunit.xml", "phpunit.xml.dist", "vitest.config.ts", "vitest.config.js", "jest.config.ts", "jest.config.js"]);
const wrapperNames = new Set(["gradlew", "mvnw"]);

export interface CommandCandidate {
  ecosystem: string;
  kind: "test" | "check" | "build" | "lint" | "typecheck";
  command: string;
  cwd: string;
  confidence: "high" | "medium";
  sources: string[];
}

export interface TestContextReport {
  root: string;
  workspaceRoots: string[];
  dirtyPaths: string[];
  candidates: CommandCandidate[];
  warnings: string[];
  evidence: {
    manifests: string[];
    lockfiles: string[];
    testConfigs: string[];
    testRoots: string[];
    wrappers: string[];
  };
  scannedFiles: number;
  scannedDirectories: number;
  scanTruncated: boolean;
  installActions: never[];
}

const MAX_SCAN_FILES = 2000;
const MAX_SCAN_DIRECTORIES = 1000;
const MAX_CANDIDATES = 100;
const MAX_SNAPSHOT_PATHS = 200;
const MAX_SNAPSHOT_FILE_BYTES = 1_000_000;

interface WalkState {
  files: string[];
  testRoots: string[];
  directories: number;
  truncated: boolean;
}

async function walk(root: string, state: WalkState) {
  const queue = [{ path: root, depth: 0 }];
  let cursor = 0;
  while (cursor < queue.length && !state.truncated) {
    const current = queue[cursor++]!;
    const entries = await readdir(current.path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.filter((entry) => !entry.isDirectory())) {
      state.files.push(join(current.path, entry.name));
      if (state.files.length >= MAX_SCAN_FILES) {
        state.truncated = true;
        break;
      }
    }
    if (state.truncated) break;
    const directories = entries.filter((entry) => entry.isDirectory() && !ignored.has(entry.name));
    if (current.depth >= 4) {
      if (directories.length > 0) state.truncated = true;
      continue;
    }
    for (const entry of directories) {
      if (state.directories >= MAX_SCAN_DIRECTORIES) {
        state.truncated = true;
        break;
      }
      const path = join(current.path, entry.name);
      if (["test", "tests", "__tests__"].includes(entry.name)) state.testRoots.push(path);
      queue.push({ path, depth: current.depth + 1 });
      state.directories += 1;
    }
  }
}

function source(root: string, path: string) {
  return relative(root, path) || basename(path);
}

function add(candidates: CommandCandidate[], candidate: CommandCandidate) {
  if (!candidates.some((item) => item.command === candidate.command && item.cwd === candidate.cwd)) candidates.push(candidate);
}

async function text(path: string) {
  return readFile(path, "utf8").catch(() => "");
}

function porcelainPaths(output: string) {
  const paths: string[] = [];
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (/[RC]/.test(status)) index += 1;
  }
  return paths;
}

export interface WorkspaceSnapshot {
  fingerprint: string | null;
  reliable: boolean;
}

export async function captureWorkspaceSnapshot(inputRoot: string): Promise<WorkspaceSnapshot> {
  try {
    const suppliedRoot = resolve(inputRoot);
    const root = await exec("git", ["-C", suppliedRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" })
      .then(({ stdout }) => stdout.trim());
    const { stdout } = await exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
    const head = await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, encoding: "utf8" })
      .then(({ stdout: value }) => value.trim())
      .catch(() => "unborn");
    const paths = porcelainPaths(stdout);
    const hash = createHash("sha256").update(head).update("\0").update(stdout);
    let reliable = paths.length <= MAX_SNAPSHOT_PATHS;
    for (const path of paths.slice(0, MAX_SNAPSHOT_PATHS)) {
      const absolute = join(root, path);
      const metadata = await stat(absolute).catch(() => undefined);
      hash.update(`\0${path}\0${metadata?.size ?? "missing"}\0`);
      if (!metadata?.isFile()) continue;
      if (metadata.size > MAX_SNAPSHOT_FILE_BYTES) {
        reliable = false;
        continue;
      }
      hash.update(await readFile(absolute));
    }
    return { fingerprint: hash.digest("hex"), reliable };
  } catch {
    return { fingerprint: null, reliable: false };
  }
}

export function snapshotsDiffer(before: WorkspaceSnapshot, after: WorkspaceSnapshot) {
  return !before.reliable || !after.reliable || before.fingerprint !== after.fingerprint;
}

async function javascript(root: string, path: string, files: Set<string>, candidates: CommandCandidate[]) {
  const manifest = JSON.parse((await text(path)) || "{}") as { scripts?: Record<string, string> };
  const cwd = dirname(path);
  const lockNames = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "package-lock.json"];
  const lock = lockNames.find((name) => files.has(join(cwd, name)));
  const manager = lock?.startsWith("pnpm") ? "pnpm" : lock === "yarn.lock" ? "yarn" : lock?.startsWith("bun") ? "bun" : "npm";
  for (const [name, kind] of [["test", "test"], ["check", "check"], ["build", "build"], ["lint", "lint"], ["typecheck", "typecheck"]] as const) {
    if (!manifest.scripts?.[name]) continue;
    const command = manager === "npm" ? (name === "test" ? "npm test" : `npm run ${name}`) : `${manager} ${name}`;
    add(candidates, { ecosystem: "javascript", kind, command, cwd, confidence: "high", sources: [source(root, path), ...(lock ? [source(root, join(cwd, lock))] : [])] });
  }
}

export async function inspectTestContext(inputRoot: string): Promise<TestContextReport> {
  const suppliedRoot = resolve(inputRoot);
  const root = await exec("git", ["-C", suppliedRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" })
    .then(({ stdout }) => stdout.trim())
    .catch(() => suppliedRoot);
  const scan: WalkState = { files: [], testRoots: [], directories: 1, truncated: false };
  await walk(root, scan);
  const paths = scan.files;
  const files = new Set(paths);
  const listed = (names: Set<string>) => paths
    .filter((path) => names.has(basename(path)))
    .map((path) => relative(root, path))
    .sort()
    .slice(0, 100);
  const evidence: TestContextReport["evidence"] = {
    manifests: paths
      .filter((path) => manifestNames.has(basename(path)) || /\.(?:sln|csproj)$/.test(path) || /^build\.gradle(?:\.kts)?$/.test(basename(path)))
      .map((path) => relative(root, path)).sort().slice(0, 100),
    lockfiles: listed(lockfileNames),
    testConfigs: listed(testConfigNames),
    testRoots: scan.testRoots.map((path) => relative(root, path)).sort().slice(0, 100),
    wrappers: listed(wrapperNames),
  };
  const candidates: CommandCandidate[] = [];
  const workspaceRoots = new Set<string>();
  const warnings: string[] = [];
  const byName = new Map<string, string[]>();
  for (const path of paths) byName.set(basename(path), [...(byName.get(basename(path)) ?? []), path]);
  const roots = (name: string) => byName.get(name) ?? [];
  const simple = (path: string, ecosystem: string, command: string, confidence: "high" | "medium" = "high", kind: CommandCandidate["kind"] = "test") => {
    const cwd = dirname(path);
    workspaceRoots.add(cwd);
    add(candidates, { ecosystem, kind, command, cwd, confidence, sources: [source(root, path)] });
  };

  for (const path of roots("package.json")) {
    workspaceRoots.add(dirname(path));
    try { await javascript(root, path, files, candidates); } catch { warnings.push(`Could not parse ${source(root, path)}.`); }
  }
  for (const path of roots("pyproject.toml")) {
    const cwd = dirname(path);
    const configuration = await text(path);
    if (/pytest|tool\.pytest/i.test(configuration)) {
      simple(path, "python", files.has(join(cwd, "uv.lock")) ? "uv run pytest" : files.has(join(cwd, "poetry.lock")) ? "poetry run pytest" : "pytest");
    }
  }
  for (const path of roots("pytest.ini")) simple(path, "python", "pytest");
  for (const path of roots("tox.ini")) simple(path, "python", "tox");
  for (const path of roots("noxfile.py")) simple(path, "python", "nox");
  for (const path of roots("go.mod")) simple(path, "go", "go test ./...");
  for (const path of roots("Cargo.toml")) simple(path, "rust", "cargo test");
  for (const path of roots("Gemfile")) if (files.has(join(dirname(path), ".rspec")) || (await text(path)).includes("rspec")) simple(path, "ruby", "bundle exec rspec");
  for (const path of [...roots("build.gradle"), ...roots("build.gradle.kts")]) simple(path, "gradle", files.has(join(dirname(path), "gradlew")) ? "./gradlew test" : "gradle test");
  for (const path of roots("pom.xml")) simple(path, "maven", files.has(join(dirname(path), "mvnw")) ? "./mvnw test" : "mvn test");
  for (const path of paths.filter((value) => /\.(?:sln|csproj)$/.test(value))) simple(path, "dotnet", "dotnet test");
  for (const path of roots("mix.exs")) simple(path, "elixir", "mix test");
  for (const path of roots("composer.json")) {
    const parsed = JSON.parse((await text(path)) || "{}") as { scripts?: Record<string, unknown> };
    simple(path, "php", parsed.scripts?.test ? "composer test" : "vendor/bin/phpunit", parsed.scripts?.test ? "high" : "medium");
  }
  for (const path of roots("Package.swift")) simple(path, "swift", "swift test");
  for (const path of roots("pubspec.yaml")) simple(path, (await text(path)).includes("flutter:") ? "flutter" : "dart", (await text(path)).includes("flutter:") ? "flutter test" : "dart test");
  for (const path of [...roots("MODULE.bazel"), ...roots("WORKSPACE"), ...roots("WORKSPACE.bazel")]) simple(path, "bazel", "bazel test ...", "medium");
  for (const path of roots("CMakeLists.txt")) if ((await text(path)).match(/enable_testing|include\s*\(CTest\)/i)) simple(path, "cmake", "ctest --test-dir build", "medium");
  for (const path of roots("Makefile")) if ((await text(path)).match(/^test\s*:/m)) simple(path, "make", "make test");
  for (const path of [...roots("justfile"), ...roots("Justfile")]) if ((await text(path)).match(/^test\s*:/m)) simple(path, "just", "just test");
  for (const path of [...roots("Taskfile.yml"), ...roots("Taskfile.yaml")]) if ((await text(path)).match(/^\s{2}test\s*:/m)) simple(path, "task", "task test");

  const dirtyPaths: string[] = [];
  try {
    const { stdout } = await exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
    dirtyPaths.push(...porcelainPaths(stdout));
  } catch {
    // Fixture may not be a Git repository; discovery remains useful.
  }

  if (scan.truncated) warnings.push(`Repository scan reached bounded traversal limit (${paths.length} files, ${scan.directories} directories); deeper setup may be missing.`);
  if (candidates.length === 0) warnings.push("No supported repository-native test setup was found; do not invent or install a runner.");
  if (workspaceRoots.size > 1 || new Set(candidates.map(({ ecosystem }) => ecosystem)).size > 1) warnings.push("Multiple or polyglot test workspaces found; choose scope from task and source evidence.");
  const sortedCandidates = candidates.sort((a, b) => a.cwd.localeCompare(b.cwd) || a.command.localeCompare(b.command));
  if (sortedCandidates.length > MAX_CANDIDATES) warnings.push(`Command candidates truncated to ${MAX_CANDIDATES}.`);
  return {
    root,
    workspaceRoots: [...workspaceRoots].sort(),
    dirtyPaths,
    candidates: sortedCandidates.slice(0, MAX_CANDIDATES),
    warnings,
    evidence,
    scannedFiles: paths.length,
    scannedDirectories: scan.directories,
    scanTruncated: scan.truncated,
    installActions: [],
  };
}
