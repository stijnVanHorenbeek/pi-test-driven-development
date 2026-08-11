import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { EvaluationCase, FixtureTemplate } from "./spec.ts";

const exec = promisify(execFile);

async function writeFiles(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function createFixtureRepository(item: EvaluationCase, template: FixtureTemplate) {
  const root = await mkdtemp(join(tmpdir(), `pi-tdd-${item.id}-`));
  await writeFiles(root, { ...template.base_files, ...(item.base_files ?? {}) });
  await exec("git", ["init", "-q"], { cwd: root });
  await exec("git", ["config", "user.name", "Pi TDD Eval"], { cwd: root });
  await exec("git", ["config", "user.email", "pi-tdd-eval@example.invalid"], { cwd: root });
  await exec("git", ["add", "-A"], { cwd: root });
  await exec("git", ["commit", "-q", "-m", "fixture baseline"], { cwd: root });
  const baselineCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFiles(root, item.working_files ?? {});
  const preservedWorkingHashes: Record<string, string> = {};
  for (const path of Object.keys(item.working_files ?? {})) preservedWorkingHashes[path] = await sha256(join(root, path));
  const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: root });
  return {
    path: root,
    url: pathToFileURL(root.endsWith(sep) ? root : `${root}${sep}`),
    baselineCommit,
    statusBefore: stdout.trim(),
    preservedWorkingHashes,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
