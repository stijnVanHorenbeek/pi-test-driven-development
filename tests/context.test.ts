import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { captureWorkspaceSnapshot, inspectTestContext, snapshotsDiffer } from "../extensions/lib/context.ts";

const execFileP = promisify(execFile);

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "test-context-"));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

const ecosystemCases = [
  ["javascript", { "package.json": '{"scripts":{"test":"vitest run","check":"tsc --noEmit"}}', "pnpm-lock.yaml": "" }, "pnpm test"],
  ["python", { "pyproject.toml": "[tool.pytest.ini_options]\naddopts='-q'\n", "uv.lock": "" }, "uv run pytest"],
  ["go", { "go.mod": "module example.test/x\n" }, "go test ./..."],
  ["rust", { "Cargo.toml": "[package]\nname='x'\nversion='0.1.0'\n" }, "cargo test"],
  ["ruby", { "Gemfile": "gem 'rspec'\n", ".rspec": "--format progress\n" }, "bundle exec rspec"],
  ["gradle", { "build.gradle.kts": "plugins { kotlin(\"jvm\") version \"2.0.0\" }\n", "gradlew": "#!/bin/sh\n" }, "./gradlew test"],
  ["maven", { "pom.xml": "<project></project>\n" }, "mvn test"],
  ["dotnet", { "App.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"></Project>\n" }, "dotnet test"],
  ["elixir", { "mix.exs": "defmodule X.MixProject do\nend\n" }, "mix test"],
  ["php", { "composer.json": '{"scripts":{"test":"phpunit"}}' }, "composer test"],
  ["swift", { "Package.swift": "// swift-tools-version: 6.0\n" }, "swift test"],
  ["dart", { "pubspec.yaml": "name: fixture\ndev_dependencies:\n  test: any\n" }, "dart test"],
  ["flutter", { "pubspec.yaml": "name: fixture\ndependencies:\n  flutter:\n    sdk: flutter\n" }, "flutter test"],
  ["bazel", { "MODULE.bazel": "module(name = \"fixture\")\n" }, "bazel test"],
  ["cmake", { "CMakeLists.txt": "cmake_minimum_required(VERSION 3.25)\nenable_testing()\n" }, "ctest"],
  ["make", { Makefile: "test:\n\t@echo ok\n" }, "make test"],
  ["just", { justfile: "test:\n  echo ok\n" }, "just test"],
  ["task", { "Taskfile.yml": "version: '3'\ntasks:\n  test:\n    cmds: ['echo ok']\n" }, "task test"],
] as const;

for (const [name, files, expected] of ecosystemCases) {
  test(`discovers ${name} repository-native test command`, async () => {
    const result = await inspectTestContext(await fixture(files));
    assert.ok(result.candidates.some((candidate) => candidate.command.includes(expected)), JSON.stringify(result));
    assert.ok(result.candidates.every((candidate) => candidate.sources.length > 0));
    assert.ok(result.evidence.manifests.length > 0 || result.evidence.testConfigs.length > 0 || result.evidence.wrappers.length > 0);
  });
}

test("does not infer pytest from generic Python project metadata", async () => {
  const result = await inspectTestContext(await fixture({ "pyproject.toml": "[project]\nname='library'\nversion='1.0.0'\n" }));
  assert.equal(result.candidates.some((candidate) => candidate.ecosystem === "python"), false);
});

test("recognizes repository-configured tox and nox runners", async () => {
  const tox = await inspectTestContext(await fixture({ "tox.ini": "[tox]\nenvlist=py\n" }));
  assert.ok(tox.candidates.some((candidate) => candidate.command === "tox"));
  const nox = await inspectTestContext(await fixture({ "noxfile.py": "import nox\n" }));
  assert.ok(nox.candidates.some((candidate) => candidate.command === "nox"));
});

test("reports unknown setup instead of inventing or installing a runner", async () => {
  const result = await inspectTestContext(await fixture({ "src/main.zig": "pub fn main() void {}\n" }));
  assert.equal(result.candidates.length, 0);
  assert.match(result.warnings.join(" "), /no.*test setup/i);
  assert.equal(result.installActions.length, 0);
  assert.ok(result.scannedFiles >= 1);
  assert.ok(result.scannedDirectories >= 1);
  assert.equal(result.scanTruncated, false);
});

test("returns multiple sourced candidates for a polyglot repository", async () => {
  const root = await fixture({
    "web/package.json": '{"scripts":{"test":"node --test"}}',
    "api/go.mod": "module example.test/api\n",
  });
  const result = await inspectTestContext(root);
  assert.ok(result.workspaceRoots.some((value) => value.endsWith("/web")));
  assert.ok(result.workspaceRoots.some((value) => value.endsWith("/api")));
  assert.ok(result.candidates.some((value) => value.ecosystem === "javascript"));
  assert.ok(result.candidates.some((value) => value.ecosystem === "go"));
  assert.match(result.warnings.join(" "), /multiple|polyglot/i);
});

test("Git root and NUL-delimited dirty paths preserve exact filenames", async () => {
  const root = await fixture({ "nested/package.json": '{"scripts":{"test":"node --test"}}', "before name.txt": "before\n" });
  await execFileP("git", ["init", "-q"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
  await execFileP("git", ["config", "user.name", "Fixture"], { cwd: root });
  await execFileP("git", ["add", "."], { cwd: root });
  await execFileP("git", ["commit", "-qm", "fixture"], { cwd: root });
  await rename(join(root, "before name.txt"), join(root, "after\né.txt"));
  const result = await inspectTestContext(join(root, "nested"));
  assert.equal(await realpath(result.root), await realpath(root));
  assert.ok(result.dirtyPaths.includes("after\né.txt"), JSON.stringify(result.dirtyPaths));
});

test("workspace snapshot detects content changes even when porcelain status is unchanged", async () => {
  const root = await fixture({ "tracked.txt": "base\n" });
  await execFileP("git", ["init", "-q"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
  await execFileP("git", ["config", "user.name", "Fixture"], { cwd: root });
  await execFileP("git", ["add", "."], { cwd: root });
  await execFileP("git", ["commit", "-qm", "fixture"], { cwd: root });
  await writeFile(join(root, "tracked.txt"), "one!\n");
  const before = await captureWorkspaceSnapshot(root);
  await writeFile(join(root, "tracked.txt"), "two!\n");
  const after = await captureWorkspaceSnapshot(root);
  assert.equal(snapshotsDiffer(before, after), true);
});

test("workspace snapshot detects clean-to-clean commits made by commands", async () => {
  const root = await fixture({ "tracked.txt": "base\n" });
  await execFileP("git", ["init", "-q"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
  await execFileP("git", ["config", "user.name", "Fixture"], { cwd: root });
  await execFileP("git", ["add", "."], { cwd: root });
  await execFileP("git", ["commit", "-qm", "fixture"], { cwd: root });
  const before = await captureWorkspaceSnapshot(root);
  await writeFile(join(root, "tracked.txt"), "changed\n");
  await execFileP("git", ["add", "."], { cwd: root });
  await execFileP("git", ["commit", "-qm", "command mutation"], { cwd: root });
  const after = await captureWorkspaceSnapshot(root);
  assert.equal(snapshotsDiffer(before, after), true);
});

test("root manifests survive bounded scan when a large subtree appears first", async () => {
  const root = await fixture({ "large/.keep": "", "package.json": '{"scripts":{"test":"node --test"}}' });
  await Promise.all(Array.from({ length: 2100 }, (_, index) => writeFile(join(root, "large", `${index}.txt`), "")));
  const result = await inspectTestContext(root);
  assert.ok(result.candidates.some((candidate) => candidate.command === "npm test"));
  assert.equal(result.scanTruncated, true);
});

test("wide empty directory trees are bounded without hiding root manifests", async () => {
  const root = await fixture({ "package.json": '{"scripts":{"test":"node --test"}}' });
  await Promise.all(Array.from({ length: 1100 }, (_, index) => mkdir(join(root, `empty-${index}`))));
  const result = await inspectTestContext(root);
  assert.ok(result.candidates.some((candidate) => candidate.command === "npm test"));
  assert.ok(result.scannedDirectories <= 1000);
  assert.equal(result.scanTruncated, true);
});

test("scan is bounded and ignores dependency/build directories", async () => {
  const root = await fixture({
    "node_modules/pkg/package.json": '{"scripts":{"test":"never"}}',
    "target/generated/Cargo.toml": "[package]\nname='ignored'\nversion='0.1.0'\n",
    "package.json": '{"scripts":{"test":"node --test"}}',
  });
  const result = await inspectTestContext(root);
  assert.equal(result.candidates.some((candidate) => candidate.command.includes("never")), false);
  assert.equal(result.candidates.some((candidate) => candidate.ecosystem === "rust"), false);
});
