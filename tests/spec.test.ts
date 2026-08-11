import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadEvaluationSpec } from "../evals/lib/spec.ts";

const root = new URL("../", import.meta.url);

test("author-attested preregistration matrix fixes multiple models and three repetitions", async () => {
  const spec = await loadEvaluationSpec(root);
  assert.ok(spec.matrix.models.length >= 2);
  assert.equal(spec.matrix.repetitions, 3);
  assert.equal(new Set(spec.matrix.models.map((m) => `${m.provider}/${m.model}:${m.thinking}`)).size, spec.matrix.models.length);
  assert.ok(spec.matrix.models.every((model) => model.provider === "openai-codex"));
  assert.equal(spec.matrix.amendments.at(-1)?.version, spec.matrix.version);
});

test("case catalog covers required positive, negative, mixed, workflow, anti-pattern, and explicit boundaries", async () => {
  const spec = await loadEvaluationSpec(root);
  const groups = new Set(spec.cases.map((item) => item.group));
  assert.deepEqual(groups, new Set(["positive-tdd", "no-new-test", "mixed-boundary", "workflow-safety", "anti-pattern", "explicit-boundary"]));
  assert.ok(spec.cases.some((item) => item.held_out));
  assert.ok(spec.cases.some((item) => !item.held_out));
  assert.ok(spec.cases.some((item) => item.expected.skill_loaded));
  assert.ok(spec.cases.some((item) => !item.expected.skill_loaded));
  assert.ok(spec.cases.every((item) => item.task.trim().length > 0 && item.postcheck.length > 0));
  for (const item of spec.cases.filter((value) => value.expected.mode === "tdd")) {
    assert.ok(item.expected.red_output_pattern?.trim(), `${item.id} missing red_output_pattern`);
  }
});

test("case ids are unique and fixture templates resolve", async () => {
  const spec = await loadEvaluationSpec(root);
  assert.equal(new Set(spec.cases.map((item) => item.id)).size, spec.cases.length);
  for (const item of spec.cases) assert.ok(spec.templates[item.template], item.id);
});

test("automatic prompts contain no skill name or evaluator marker", async () => {
  const spec = await loadEvaluationSpec(root);
  for (const item of spec.cases.filter((value) => value.invocation === "automatic")) {
    assert.doesNotMatch(item.task, /test-driven-development|TDD_EVAL|skill:/i, item.id);
  }
});

test("matrix, cases, and templates are valid frozen JSON inputs", async () => {
  for (const path of ["evals/v1-matrix.json", "evals/cases.json", "evals/fixtures/templates.json"]) {
    const text = await readFile(new URL(path, root), "utf8");
    assert.equal(text.endsWith("\n"), true, path);
    assert.doesNotThrow(() => JSON.parse(text), path);
  }
});
