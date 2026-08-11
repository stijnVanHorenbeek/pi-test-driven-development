import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillPath = join(root, "skills", "test-driven-development", "SKILL.md");

function rpc(args: string[], input: object, env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("pi", args, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

test("real Pi package discovery exposes exact skill command once under isolated config", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-tdd-discovery-"));
  try {
    const result = await rpc([
      "--mode", "rpc",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-approve",
      "--offline",
      "-e", root,
    ], { type: "get_commands" }, {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      PI_TELEMETRY: "0",
      PI_SKIP_VERSION_CHECK: "1",
    });
    assert.equal(result.code, 0, result.stderr);
    const records = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const response = records.find((item) => item.type === "response" && item.command === "get_commands");
    assert.equal(response?.success, true, result.stdout);
    const matches = response.data.commands.filter((item: any) => item.name === "skill:test-driven-development");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].source, "skill");
    assert.equal(matches[0].sourceInfo.path, skillPath);
    assert.equal(response.data.commands.some((item: any) => item.source === "prompt"), false);
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
});
