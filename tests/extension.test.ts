import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import testAdvisor, { ADVISORY_TOOL_NAMES, looksLikeOpaqueMutation, packageSkillPath } from "../extensions/test-advisor.ts";
import { EvidenceLedger } from "../extensions/lib/evidence.ts";

const execFileP = promisify(execFile);

type Handler = (event: any, context: any) => any;

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const tools: any[] = [];
  let active = ["read", "bash", "edit", "write"];
  const commands = [{
    name: "skill:test-driven-development",
    source: "skill",
    sourceInfo: { path: packageSkillPath, source: "package", scope: "temporary", origin: "package" },
  }];
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool(tool: any) { tools.push(tool); },
    getActiveTools() { return [...active]; },
    setActiveTools(names: string[]) { active = [...names]; },
    getCommands() { return commands; },
  };
  return { pi, handlers, tools, active: () => active };
}

async function emit(fake: ReturnType<typeof fakePi>, name: string, event: any, branch: any[] = [], cwd = process.cwd()) {
  for (const handler of fake.handlers.get(name) ?? []) await handler(event, { cwd, sessionManager: { getBranch: () => branch } });
}

test("opaque mutation detector ignores output suppression but flags shell writes", () => {
  for (const command of ["npm test 2>/dev/null", "npm test 2>&1", "printf x > /dev/null"]) {
    assert.equal(looksLikeOpaqueMutation(command), false, command);
  }
  for (const command of ["printf x > result.txt", "sed -i '' s/a/b/ file", "cp a b", "rm file", "git commit -am change", "git reset --hard HEAD~1"]) {
    assert.equal(looksLikeOpaqueMutation(command), true, command);
  }
});

test("defers bounded advisory tool registration until package skill activation", async () => {
  const fake = fakePi();
  testAdvisor(fake.pi as never);
  assert.equal(fake.tools.length, 0);
  await emit(fake, "tool_result", {
    toolName: "read",
    input: { path: packageSkillPath },
    isError: false,
    content: [{ type: "text", text: "skill" }],
  });
  assert.deepEqual(new Set(fake.tools.map((tool) => tool.name)), new Set(ADVISORY_TOOL_NAMES));
  assert.equal(fake.tools.some((tool) => ["read", "bash", "edit", "write"].includes(tool.name)), false);
});

test("advisory tools start inactive while preserving all ambient tools", async () => {
  const fake = fakePi();
  testAdvisor(fake.pi as never);
  await emit(fake, "session_start", { reason: "startup" });
  assert.deepEqual(fake.active(), ["read", "bash", "edit", "write"]);
});

test("successful exact package SKILL read activates tools additively", async () => {
  const fake = fakePi();
  testAdvisor(fake.pi as never);
  await emit(fake, "tool_result", {
    toolName: "read",
    input: { path: packageSkillPath },
    isError: false,
    content: [{ type: "text", text: "skill" }],
  });
  assert.deepEqual(new Set(fake.active()), new Set(["read", "bash", "edit", "write", ...ADVISORY_TOOL_NAMES]));
  assert.deepEqual(new Set(fake.tools.map((tool) => tool.name)), new Set(ADVISORY_TOOL_NAMES));
});

test("failed or lookalike SKILL reads do not activate tools", async () => {
  for (const event of [
    { toolName: "read", input: { path: packageSkillPath }, isError: true },
    { toolName: "read", input: { path: `${packageSkillPath}.bak` }, isError: false },
    { toolName: "read", input: { path: "/other/test-driven-development/SKILL.md" }, isError: false },
  ]) {
    const fake = fakePi();
    testAdvisor(fake.pi as never);
    await emit(fake, "tool_result", event);
    assert.deepEqual(fake.active(), ["read", "bash", "edit", "write"]);
  }
});

test("explicit invocation requires exact command token and package provenance", async () => {
  const lookalike = fakePi();
  testAdvisor(lookalike.pi as never);
  await emit(lookalike, "input", { text: "/skill:test-driven-development-extra change behavior", source: "interactive" });
  assert.deepEqual(lookalike.active(), ["read", "bash", "edit", "write"]);

  const exact = fakePi();
  testAdvisor(exact.pi as never);
  await emit(exact, "input", { text: "/skill:test-driven-development change behavior", source: "interactive" });
  assert.ok(ADVISORY_TOOL_NAMES.every((name) => exact.active().includes(name)));
});

test("test_run records command-caused workspace mutations as opaque", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-tdd-tool-mutation-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "base.txt"), "base\n");
  await execFileP("git", ["init", "-q"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
  await execFileP("git", ["config", "user.name", "Fixture"], { cwd: root });
  await execFileP("git", ["add", "."], { cwd: root });
  await execFileP("git", ["commit", "-qm", "fixture"], { cwd: root });

  const fake = fakePi();
  testAdvisor(fake.pi as never);
  await emit(fake, "tool_result", { toolName: "read", input: { path: packageSkillPath }, isError: false, content: [] });
  const runTool = fake.tools.find((tool) => tool.name === "test_run");
  await runTool.execute("run", { phase: "validation", command: "node -e \"require('node:fs').writeFileSync('changed.txt','x')\"" }, undefined, undefined, { cwd: root });
  const status = JSON.parse((await fake.tools.find((tool) => tool.name === "test_status").execute()).content[0].text);
  assert.equal(status.supportedLabel, "verification-limited");
  assert.match(status.warnings.join(" "), /test_run changed/i);
});

test("built-in bash snapshots detect arbitrary repository mutations", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-tdd-bash-mutation-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "base.txt"), "base\n");
  await execFileP("git", ["init", "-q"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
  await execFileP("git", ["config", "user.name", "Fixture"], { cwd: root });
  await execFileP("git", ["add", "."], { cwd: root });
  await execFileP("git", ["commit", "-qm", "fixture"], { cwd: root });

  const fake = fakePi();
  testAdvisor(fake.pi as never);
  await emit(fake, "tool_result", { toolName: "read", input: { path: packageSkillPath }, isError: false, content: [] }, [], root);
  await emit(fake, "tool_call", { toolCallId: "bash-1", toolName: "bash", input: { command: "node custom-script.js" } }, [], root);
  await writeFile(join(root, "changed.txt"), "x");
  await emit(fake, "tool_result", { toolCallId: "bash-1", toolName: "bash", input: { command: "node custom-script.js" }, isError: false }, [], root);
  const status = JSON.parse((await fake.tools.find((tool) => tool.name === "test_status").execute()).content[0].text);
  assert.match(status.warnings.join(" "), /built-in bash/i);
});

test("session restoration marks post-snapshot built-in mutations opaque", async () => {
  const fake = fakePi();
  testAdvisor(fake.pi as never);
  const ledger = new EvidenceLedger();
  ledger.setDecision("tdd");
  ledger.recordMutation({ path: "test/math.test.js", category: "test", source: "edit" });
  ledger.recordRun({ phase: "red", command: "npm test", exitCode: 1, output: "missing multiply", expectedFailure: "multiply", durationMs: 1 });
  ledger.recordMutation({ path: "src/math.js", category: "production", source: "edit" });
  ledger.recordRun({ phase: "green", command: "npm test", exitCode: 0, output: "pass", durationMs: 1 });
  await emit(fake, "session_start", {}, [
    { type: "message", message: { role: "toolResult", toolName: "test_status", details: { ledger: ledger.toDetails() } } },
    { type: "message", message: { role: "toolResult", toolName: "edit", isError: false } },
  ]);
  const statusTool = fake.tools.find((tool) => tool.name === "test_status");
  const result = await statusTool.execute();
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.supportedLabel, "verification-limited");
  assert.match(status.warnings.join(" "), /opaque/i);
});

test("session restoration activates from successful package skill read", async () => {
  const fake = fakePi();
  testAdvisor(fake.pi as never);
  await emit(fake, "session_start", {}, [
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: packageSkillPath } }] } },
    { type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", isError: false } },
  ]);
  assert.ok(ADVISORY_TOOL_NAMES.every((name) => fake.active().includes(name)));
});

test("session restoration activates from context-only advisory evidence", async () => {
  const fake = fakePi();
  testAdvisor(fake.pi as never);
  const ledger = new EvidenceLedger();
  await emit(fake, "session_start", {}, [{
    type: "message",
    message: {
      role: "toolResult",
      toolName: "test_context",
      details: { context: { root: "/repo" }, ledger: ledger.toDetails() },
    },
  }]);
  assert.ok(ADVISORY_TOOL_NAMES.every((name) => fake.active().includes(name)));
});
