import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import { createFixtureRepository } from "../evals/lib/fixtures.ts";
import { loadEvaluationSpec } from "../evals/lib/spec.ts";

const root = new URL("../", import.meta.url);
const exec = promisify(execFile);

async function checkExit(path: string, command: string[]) {
  try { await exec(command[0]!, command.slice(1), { cwd: path }); return 0; }
  catch (error: any) {
    if (typeof error.code !== "number") throw error;
    return error.code;
  }
}

test("behavior-change postchecks reject the original broken Node fixtures", async () => {
  const spec = await loadEvaluationSpec(root);
  for (const item of spec.cases.filter((item) => item.expected.mode === "tdd" && item.postcheck[0] === "node")) {
    const fixture = await createFixtureRepository(item, spec.templates[item.template]);
    try { assert.notEqual(await checkExit(fixture.path, item.postcheck), 0, item.id); }
    finally { await fixture.cleanup(); }
  }
});

test("preservation postchecks cannot be weakened by editing the repository tests", async () => {
  const spec = await loadEvaluationSpec(root);
  for (const [id, source] of [
    ["pure-refactor", "export function invoiceTotal() { return 0; }\n"],
    ["duplicate-coverage-antipattern", "export function absolute() { return 0; }\n"],
  ]) {
    const item = spec.cases.find((item) => item.id === id)!;
    const fixture = await createFixtureRepository(item, spec.templates[item.template]);
    try {
      assert.equal(await checkExit(fixture.path, item.postcheck), 0, `${id} baseline`);
      await writeFile(new URL("src/math.js", fixture.url), source!);
      await writeFile(new URL("test/math.test.js", fixture.url), "// weakened suite\n");
      assert.notEqual(await checkExit(fixture.path, item.postcheck), 0, `${id} broken artifact`);
    } finally { await fixture.cleanup(); }
  }
});

test("dotnet fixtures run real tests and independent postchecks reject broken artifacts", async (context) => {
  try { await exec("dotnet", ["--version"], { timeout: 10_000 }); }
  catch { context.skip(".NET SDK unavailable in this environment"); return; }
  const spec = await loadEvaluationSpec(root);
  for (const id of ["dotnet-clamp-bug", "dotnet-nullable-metadata"]) {
    const item = spec.cases.find((candidate) => candidate.id === id);
    assert.ok(item, `${id} absent`);
    const fixture = await createFixtureRepository(item, spec.templates[item.template]);
    try {
      assert.equal(await checkExit(fixture.path, ["dotnet", "test", "tests/Calculator.Tests.csproj"]), 0, `${id}: baseline tests`);
      assert.notEqual(await checkExit(fixture.path, item.postcheck), 0, `${id}: broken baseline`);
      if (id === "dotnet-clamp-bug") {
        await writeFile(new URL("src/Calculator.cs", fixture.url), "namespace Fixture;\npublic static class Calculator { public static int Clamp(int value, int min, int max) => Math.Clamp(value, min, max); }\n");
        await writeFile(new URL("tests/CalculatorTests.cs", fixture.url), "// deliberately weakened repository tests\n");
      } else {
        const project = await readFile(new URL("src/Calculator.csproj", fixture.url), "utf8");
        await writeFile(new URL("src/Calculator.csproj", fixture.url), project.replace("</PropertyGroup>", "<Nullable>enable</Nullable></PropertyGroup>"));
      }
      assert.equal(await checkExit(fixture.path, item.postcheck), 0, `${id}: corrected artifact`);
    } finally { await fixture.cleanup(); }
  }
});

test("creates committed baseline then applies working files as dirty user work", async () => {
  const spec = await loadEvaluationSpec(root);
  const item = spec.cases.find((value) => value.id === "dirty-tree-bug");
  assert.ok(item);
  const fixture = await createFixtureRepository(item, spec.templates[item.template]);
  assert.match(fixture.statusBefore, /NOTES\.md/);
  assert.equal(await readFile(new URL("NOTES.md", fixture.url), "utf8"), "User draft: keep this exact line.\n");
  assert.ok(fixture.preservedWorkingHashes["NOTES.md"]);
  await fixture.cleanup();
});

test("base overlay is committed and not mistaken for incoming work", async () => {
  const spec = await loadEvaluationSpec(root);
  const item = spec.cases.find((value) => value.id === "reproducible-bug");
  assert.ok(item);
  const fixture = await createFixtureRepository(item, spec.templates[item.template]);
  assert.equal(fixture.statusBefore, "");
  assert.match(await readFile(new URL("src/math.js", fixture.url), "utf8"), /divide/);
  await fixture.cleanup();
});
