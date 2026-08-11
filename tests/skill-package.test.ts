import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(root, "skills", "test-driven-development");
const skillPath = join(skillRoot, "SKILL.md");

function frontmatter(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "missing frontmatter");
  return match[1];
}

function foldedDescription(metadata: string) {
  const match = metadata.match(/^description: >-\n((?:  .*\n?)+)/m);
  assert.ok(match, "missing folded description");
  return match[1].split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
}

test("skill frontmatter is valid, bounded, and routes both positive and negative boundaries", async () => {
  const text = await readFile(skillPath, "utf8");
  const metadata = frontmatter(text);
  const description = foldedDescription(metadata);
  assert.match(metadata, /^name: test-driven-development$/m);
  assert.match(metadata, /^license: MIT$/m);
  assert.ok(description.length <= 1024, `${description.length} chars`);
  assert.match(description, /observable production behavior/i);
  assert.match(description, /reproducible bug/i);
  assert.match(description, /refactor/i);
  assert.match(description, /do not auto-use/i);
  assert.match(description, /ordinary copy|style|format/i);
  assert.match(description, /code already written|already-written|pre-existing/i);
});

test("hot skill stays lean and links one-level progressive references", async () => {
  const bytes = await readFile(skillPath);
  assert.ok(bytes.byteLength <= 6000, `${bytes.byteLength} bytes`);
  const text = bytes.toString("utf8");
  const links = [...text.matchAll(/`(references\/[a-z0-9-]+\.md)`/g)].map((match) => match[1]);
  assert.deepEqual(new Set(links), new Set([
    "references/workflow.md",
    "references/regression-evaluation.md",
    "references/refactoring.md",
    "references/test-design.md",
    "references/runners.md",
    "references/failure-modes.md",
    "references/ui-content.md",
    "references/examples.md",
  ]));
  for (const link of links) await readFile(join(skillRoot, link), "utf8");
});

test("critical safety and evidence concepts are explicit without source-text ritual", async () => {
  const text = (await readFile(skillPath, "utf8")).toLowerCase();
  assert.match(text, /never.*(discard|delete|revert)|do not.*(discard|delete|revert)/s);
  assert.match(text, /pre-existing|user work/);
  assert.match(text, /unobserved|observed/);
  for (const label of ["tdd-attested", "regression-verified", "preservation-verified", "validation-only", "verification-limited"]) {
    assert.ok(text.includes(label), label);
  }
  assert.match(text, /built-in/i);
  assert.match(text, /`read`/);
  assert.match(text, /`bash`/);
  assert.doesNotMatch(text, /test_(?:context|policy|run|status)/);
});
