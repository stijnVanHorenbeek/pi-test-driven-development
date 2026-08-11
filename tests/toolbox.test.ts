import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runEvidenceCommand } from "../extensions/lib/toolbox.ts";

test("red command requires nonzero exit and stable evidence matching declared reason", async () => {
  const valid = await runEvidenceCommand({
    cwd: process.cwd(),
    phase: "red",
    command: "node -e \"console.error('missing behavior'); process.exit(1)\"",
    expectedFailure: "missing behavior",
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.exitCode, 1);

  const frameworkWording = await runEvidenceCommand({
    cwd: process.cwd(),
    phase: "red",
    command: "node -e \"console.error(\\\"module does not provide an export named 'multiply'\\\"); process.exit(1)\"",
    expectedFailure: "multiply",
  });
  assert.equal(frameworkWording.valid, true);

  const passing = await runEvidenceCommand({
    cwd: process.cwd(),
    phase: "red",
    command: "node -e \"process.exit(0)\"",
    expectedFailure: "missing behavior",
  });
  assert.equal(passing.valid, false);
});

test("non-red phases require zero but retain bounded failure evidence", async () => {
  const result = await runEvidenceCommand({
    cwd: process.cwd(),
    phase: "green",
    command: "node -e \"console.error('x'.repeat(60000)); process.exit(2)\"",
    maxOutputBytes: 1024,
  });
  assert.equal(result.valid, false);
  assert.equal(result.exitCode, 2);
  assert.ok(Buffer.byteLength(result.output) <= 1200);
  assert.equal(result.truncated, true);
});

test("command cancellation kills descendant process tree", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "pi-tdd-cancel-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, "descendant-ran");
  const child = join(root, "child.cjs");
  const parent = join(root, "parent.cjs");
  await writeFile(child, `process.on("SIGTERM", () => {}); setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "alive"), 300);\n`);
  await writeFile(parent, `require("node:child_process").spawn(process.execPath, [${JSON.stringify(child)}], { stdio: "ignore" }); setInterval(() => {}, 1000);\n`);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 150);
  const result = await runEvidenceCommand({
    cwd: root,
    phase: "validation",
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(parent)}`,
    signal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(result.cancelled, true);
  assert.equal(result.valid, false);
  await assert.rejects(access(marker));
});
