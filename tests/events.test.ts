import assert from "node:assert/strict";
import test from "node:test";

import { EventEvidence } from "../evals/lib/events.ts";

const skillPath = "/package/skills/test-driven-development/SKILL.md";

test("counts skill load only after successful exact SKILL read", () => {
  const events = new EventEvidence(skillPath);
  events.consume({ type: "tool_execution_start", toolCallId: "1", toolName: "read", args: { path: skillPath } });
  events.consume({ type: "tool_execution_end", toolCallId: "1", toolName: "read", result: {}, isError: false });
  events.consume({ type: "tool_execution_start", toolCallId: "2", toolName: "read", args: { path: "/package/skills/test-driven-development/references/workflow.md" } });
  events.consume({ type: "tool_execution_end", toolCallId: "2", toolName: "read", result: {}, isError: false });
  assert.equal(events.summary().skillLoaded, true);
  assert.equal(events.summary().skillEntrypointReads, 1);
  assert.equal(events.summary().skillTreeReads, 2);
});

test("failed, sibling, and lookalike reads do not count", () => {
  const events = new EventEvidence(skillPath);
  for (const [id, path, isError] of [
    ["1", skillPath, true],
    ["2", "/other/test-driven-development/SKILL.md", false],
    ["3", `${skillPath}.bak`, false],
  ] as const) {
    events.consume({ type: "tool_execution_start", toolCallId: id, toolName: "read", args: { path } });
    events.consume({ type: "tool_execution_end", toolCallId: id, toolName: "read", result: {}, isError });
  }
  assert.equal(events.summary().skillLoaded, false);
  assert.equal(events.summary().failedReads, 1);
});

test("stores authoritative final text but never hidden thinking content", () => {
  const events = new EventEvidence(skillPath);
  events.consume({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "secret chain of thought" },
        { type: "text", text: "Final evidence" },
      ],
      provider: "provider",
      model: "model",
      usage: { input: 10, output: 4 },
    },
  });
  const summary = events.summary();
  assert.equal(summary.finalText, "Final evidence");
  assert.equal(summary.stopReason, undefined);
  assert.doesNotMatch(JSON.stringify(summary), /secret chain of thought/);
});

test("retains provider stop errors without treating them as final text", () => {
  const events = new EventEvidence(skillPath);
  events.consume({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      provider: "provider",
      model: "model",
      stopReason: "error",
      errorMessage: "subscription unavailable",
    },
  });
  const summary = events.summary();
  assert.equal(summary.stopReason, "error");
  assert.equal(summary.errorMessage, "subscription unavailable");
  assert.equal(summary.finalText, "");
});

test("records bounded mutation and command timeline without full tool output", () => {
  const events = new EventEvidence(skillPath, { maxResultChars: 20 });
  events.consume({ type: "tool_execution_start", toolCallId: "e", toolName: "edit", args: { path: "src/x.js", edits: [] } });
  events.consume({ type: "tool_execution_end", toolCallId: "e", toolName: "edit", result: { content: [{ type: "text", text: "x".repeat(100) }] }, isError: false });
  const summary = events.summary();
  assert.equal(summary.timeline[0]?.toolName, "edit");
  assert.ok((summary.timeline[0]?.resultText.length ?? 0) <= 21);
});

test("keeps bash failure context and exit evidence when bounded output is truncated", () => {
  const events = new EventEvidence(skillPath, { maxResultChars: 80 });
  events.consume({ type: "tool_execution_start", toolCallId: "b", toolName: "bash", args: { command: "npm test" } });
  events.consume({
    type: "tool_execution_end",
    toolCallId: "b",
    toolName: "bash",
    isError: false,
    result: { content: [{ type: "text", text: `EXPECTED_MULTIPLY_FAILURE\n${"x".repeat(200)}\nCommand exited with code 1` }] },
  });
  const result = events.summary().timeline[0]?.resultText ?? "";
  assert.match(result, /EXPECTED_MULTIPLY_FAILURE/);
  assert.match(result, /Command exited with code 1/);
});

test("records start and completion order for parallel-safe chronology", () => {
  const events = new EventEvidence(skillPath);
  events.consume({ type: "tool_execution_start", toolCallId: "test", toolName: "bash", args: { command: "npm test" } });
  events.consume({ type: "tool_execution_start", toolCallId: "edit", toolName: "edit", args: { path: "src/math.js" } });
  events.consume({ type: "tool_execution_end", toolCallId: "edit", toolName: "edit", result: {}, isError: false });
  events.consume({ type: "tool_execution_end", toolCallId: "test", toolName: "bash", result: {}, isError: false });
  const [testRun, edit] = events.summary().timeline;
  assert.ok((testRun?.completionSequence ?? 0) > (edit?.sequence ?? 0));
  assert.ok((edit?.completionSequence ?? 0) < (testRun?.completionSequence ?? 0));
});

test("records built-in evidence without interpreting custom tool metadata", () => {
  const events = new EventEvidence(skillPath, { maxResultChars: 10 });
  events.consume({ type: "tool_execution_start", toolCallId: "b", toolName: "bash", args: { command: "npm test" } });
  events.consume({
    type: "tool_execution_end",
    toolCallId: "b",
    toolName: "bash",
    isError: false,
    result: {
      content: [{ type: "text", text: "x".repeat(1000) }],
      details: { status: { supportedLabel: "tdd-attested" } },
    },
  });
  assert.equal(events.summary().timeline[0]?.toolName, "bash");
  assert.doesNotMatch(JSON.stringify(events.summary().timeline[0]), /supportedLabel/);
});
