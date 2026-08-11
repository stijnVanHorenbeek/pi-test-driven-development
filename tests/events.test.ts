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

test("keeps bounded advisory status metadata when rendered JSON is truncated", () => {
  const events = new EventEvidence(skillPath, { maxResultChars: 10 });
  events.consume({ type: "tool_execution_start", toolCallId: "s", toolName: "test_status", args: {} });
  events.consume({
    type: "tool_execution_end",
    toolCallId: "s",
    toolName: "test_status",
    isError: false,
    result: {
      content: [{ type: "text", text: "x".repeat(1000) }],
      details: { status: { decision: "tdd", supportedLabel: "tdd-attested", runs: [{ output: "secretly huge" }] } },
    },
  });
  assert.deepEqual(events.summary().timeline[0]?.resultMetadata, { decision: "tdd", supportedLabel: "tdd-attested" });
  assert.doesNotMatch(JSON.stringify(events.summary().timeline[0]?.resultMetadata), /secretly huge/);
});
