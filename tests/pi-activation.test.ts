import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const packageSkillPath = resolve("skills/test-driven-development/SKILL.md");

test("real Pi SDK loads package skill without changing built-in tools", async (context) => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-tdd-sdk-"));
  context.after(() => rm(agentDir, { recursive: true, force: true }));
  const stopperPath = join(agentDir, "stop-after-input.ts");
  await writeFile(stopperPath, 'export default (pi: any) => pi.on("input", () => ({ action: "handled" }));\n');
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir,
    settingsManager,
    additionalExtensionPaths: [stopperPath],
    additionalSkillPaths: [packageSkillPath],
    skillsOverride: (result) => ({
      ...result,
      skills: result.skills.filter((skill) => resolve(skill.filePath) === packageSkillPath),
    }),
    systemPromptOverride: () => "Follow loaded skills.",
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  assert.deepEqual(loader.getSkills().skills.map((skill) => resolve(skill.filePath)), [packageSkillPath]);

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    agentDir,
    settingsManager,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  });
  context.after(() => session.dispose());
  const before = session.getActiveToolNames();

  await session.prompt("/skill:test-driven-development inspect only");
  assert.deepEqual(session.getActiveToolNames(), before);
  assert.equal(before.some((name) => /^test_(?:context|policy|run|status)$/.test(name)), false);
});
