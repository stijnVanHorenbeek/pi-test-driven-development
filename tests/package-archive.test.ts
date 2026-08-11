import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);

test("npm archive contains runtime package but excludes eval and test sources", async () => {
  const { stdout } = await run("npm", ["pack", "--dry-run", "--json"], { cwd: root, maxBuffer: 2_000_000 });
  const parsed = JSON.parse(stdout);
  const payload = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  assert.ok(payload && typeof payload === "object");
  const paths = new Set((payload as { files: Array<{ path: string }> }).files.map((item) => item.path));
  assert.ok(paths.has("skills/test-driven-development/SKILL.md"));
  assert.equal([...paths].some((path) => path.startsWith("extensions/")), false);
  assert.ok(paths.has("docs/v1-acceptance-contract.md"));
  assert.equal([...paths].some((path) => path.startsWith("tests/")), false);
  assert.equal([...paths].some((path) => path.startsWith("evals/")), false);
  assert.equal([...paths].some((path) => path.startsWith("prompts/")), false);
  assert.equal([...paths].some((path) => path.startsWith("themes/")), false);
});
