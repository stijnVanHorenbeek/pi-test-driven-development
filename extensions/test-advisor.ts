import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { captureWorkspaceSnapshot, inspectTestContext, snapshotsDiffer, type TestContextReport, type WorkspaceSnapshot } from "./lib/context.ts";
import { EvidenceLedger, type MutationCategory, type RunPhase } from "./lib/evidence.ts";
import { decidePolicy } from "./lib/policy.ts";
import { runEvidenceCommand } from "./lib/toolbox.ts";

export const packageSkillPath = fileURLToPath(
  new URL("../skills/test-driven-development/SKILL.md", import.meta.url),
);
export const ADVISORY_TOOL_NAMES = ["test_context", "test_policy", "test_run", "test_status"] as const;

function normalizedPath(path: string, cwd: string) {
  const value = path.startsWith("@") ? path.slice(1) : path;
  return resolve(cwd, value);
}

function classifyMutation(path: string): MutationCategory {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  if (
    /(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(normalized)
    || /\.(test|spec)\.[a-z0-9]+$/.test(normalized)
    || normalized.endsWith(".snap")
  ) return "test";
  if (/\.(md|txt|rst)$/.test(normalized)) return "other";
  return "production";
}

export function looksLikeOpaqueMutation(command: unknown) {
  if (typeof command !== "string") return false;
  if (/(?:^|[;&|])\s*(?:sed\s+-i|perl\s+-pi|tee\s|mv\s|cp\s|rm\s|touch\s|truncate\s|dd\s|rsync\s|git\s+(?:commit|reset|restore|clean|apply|checkout|switch)\b)/.test(command)) return true;
  for (const match of command.matchAll(/(?:^|[\s;&|])(?:\d*)>>?\s*([^\s;&|]+)/g)) {
    const target = (match[1] ?? "").replace(/^['"]|['"]$/g, "");
    if (target !== "/dev/null" && !/^&\d+$/.test(target)) return true;
  }
  return false;
}

function exactSkillRead(event: any, cwd: string) {
  return event.toolName === "read"
    && event.isError === false
    && typeof event.input?.path === "string"
    && normalizedPath(event.input.path, cwd) === resolve(packageSkillPath);
}

function branchHasPackageSkillRead(branch: any[], cwd: string) {
  const reads = new Map<string, unknown>();
  for (const entry of branch) {
    const message = entry?.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant") {
      for (const content of message.content ?? []) {
        if (content?.type === "toolCall" && content.name === "read") reads.set(content.id, content.arguments?.path);
      }
    }
    if (message?.role === "toolResult" && message.toolName === "read" && !message.isError) {
      const path = reads.get(message.toolCallId);
      if (typeof path === "string" && normalizedPath(path, cwd) === resolve(packageSkillPath)) return true;
    }
  }
  return false;
}

function toolResultState(branch: any[]) {
  const messages = branch.map((entry) => entry?.type === "message" ? entry.message : undefined);
  const context = [...messages].reverse().find((message) => message?.details?.context)?.details.context as TestContextReport | undefined;
  let snapshotIndex = -1;
  let ledger = new EvidenceLedger();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const details = message?.role === "toolResult" && ADVISORY_TOOL_NAMES.includes(message.toolName)
      ? message.details?.ledger
      : undefined;
    if (details?.version !== 1) continue;
    try {
      ledger = EvidenceLedger.fromDetails(details);
      snapshotIndex = index;
    } catch {
      return { ledger, context, found: false };
    }
    break;
  }
  if (snapshotIndex < 0) return { ledger, context, found: false };
  for (const message of messages.slice(snapshotIndex + 1)) {
    if (message?.role === "toolResult" && !message.isError && ["edit", "write", "bash"].includes(message.toolName)) {
      ledger.recordOpaqueMutation(`Restored branch contains ${message.toolName} activity after latest advisory evidence snapshot.`);
    }
  }
  return { ledger, context, found: true };
}

export default function testAdvisor(pi: ExtensionAPI) {
  let ledger = new EvidenceLedger();
  let lastContext: TestContextReport | undefined;
  const bashSnapshots = new Map<string, WorkspaceSnapshot>();
  const lastSnapshots = new Map<string, WorkspaceSnapshot>();

  let registered = false;
  const activate = () => {
    registerTools();
    const active = pi.getActiveTools();
    pi.setActiveTools([...new Set([...active, ...ADVISORY_TOOL_NAMES])]);
  };

  function registerTools() {
    if (registered) return;
    registered = true;

    pi.registerTool({
    name: "test_context",
    label: "Test Context",
    description: "Inspect repository test setup without executing or installing anything. Returns sourced polyglot runner/check candidates, workspace ambiguity, and dirty-tree evidence.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      lastContext = await inspectTestContext(ctx.cwd);
      signal?.throwIfAborted();
      return {
        content: [{ type: "text", text: JSON.stringify(lastContext, null, 2) }],
        details: { context: lastContext, ledger: ledger.toDetails() },
      };
    },
  });

    pi.registerTool({
    name: "test_policy",
    label: "Test Policy",
    description: "Select TDD, regression verification, preservation, validation-only, or verification-limited mode from explicit task facts. Advisory: supplied facts still require repository and contract evidence.",
    parameters: Type.Object({
      change: StringEnum([
        "new-behavior",
        "bug",
        "pure-refactor",
        "existing-implementation",
        "ordinary-static",
        "contractual-copy",
        "config-boundary",
        "docs-comments",
        "test-only",
        "generated-vendor",
      ] as const),
      coverage: StringEnum(["sufficient", "gap", "unknown", "not-applicable"] as const),
      automation: StringEnum(["feasible", "unavailable", "unsafe", "flaky", "disproportionate"] as const),
      strictTdd: Type.Boolean({ description: "True only when user explicitly requested strict TDD." }),
    }),
    async execute(_toolCallId, params) {
      const decision = decidePolicy(params);
      ledger.setDecision(decision.mode);
      return {
        content: [{ type: "text", text: JSON.stringify(decision, null, 2) }],
        details: { decision, ledger: ledger.toDetails() },
      };
    },
  });

    pi.registerTool({
    name: "test_run",
    label: "Evidence Test Run",
    description: "Execute an exact repository command in an explicit evidence phase and record bounded output. Same command-execution risk as bash. Red candidate requires nonzero exit plus stable evidence matching predeclared reason; inspect semantic cause. No runner is installed automatically.",
    parameters: Type.Object({
      phase: StringEnum(["baseline", "red", "green", "regression", "broader", "validation"] as const),
      command: Type.String({ description: "Exact repository-native command selected from repository evidence." }),
      expectedFailure: Type.Optional(Type.String({ description: "Shortest stable literal expected in behavior-specific red output, such as contract symbol or value; do not guess a full framework error sentence. Required for red." })),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params.phase === "red" && !params.expectedFailure?.trim()) {
        throw new Error("Red phase requires expectedFailure text declared before execution.");
      }
      const before = await captureWorkspaceSnapshot(ctx.cwd);
      const result = await runEvidenceCommand({
        cwd: ctx.cwd,
        phase: params.phase as RunPhase,
        command: params.command,
        expectedFailure: params.expectedFailure,
        signal,
      });
      const after = await captureWorkspaceSnapshot(ctx.cwd);
      lastSnapshots.set(resolve(ctx.cwd), after);
      if (snapshotsDiffer(before, after)) {
        ledger.recordOpaqueMutation("test_run changed repository state or workspace snapshot was incomplete.");
      }
      const run = ledger.recordRun(result);
      return {
        content: [{ type: "text", text: JSON.stringify({ ...result, output: result.output }, null, 2) }],
        details: { run, ledger: ledger.toDetails() },
      };
    },
  });

    pi.registerTool({
    name: "test_status",
    label: "Testing Evidence Status",
    description: "Report strongest evidence label supported by observed decision, command phases, and visible edit/write ordering. Downgrades unsupported TDD claims and names residual gaps.",
    parameters: Type.Object({}),
    async execute() {
      const status = ledger.status();
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        details: { status, context: lastContext, ledger: ledger.toDetails() },
      };
    },
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    const restored = toolResultState(branch);
    ledger = restored.ledger;
    lastContext = restored.context;
    if (restored.found || branchHasPackageSkillRead(branch, ctx.cwd)) {
      activate();
      lastSnapshots.set(resolve(ctx.cwd), await captureWorkspaceSnapshot(ctx.cwd));
    }
  });

  pi.on("input", async (event, ctx) => {
    if (event.text.trim().split(/\s+/, 1)[0] !== "/skill:test-driven-development") return { action: "continue" as const };
    const command = pi.getCommands().find((item) =>
      item.source === "skill"
      && ["test-driven-development", "skill:test-driven-development"].includes(item.name)
      && resolve(item.sourceInfo.path) === resolve(packageSkillPath),
    );
    if (command) {
      activate();
      lastSnapshots.set(resolve(ctx.cwd), await captureWorkspaceSnapshot(ctx.cwd));
    }
    return { action: "continue" as const };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!registered || event.toolName !== "bash") return;
    bashSnapshots.set(event.toolCallId, await captureWorkspaceSnapshot(ctx.cwd));
  });

  pi.on("tool_result", async (event, ctx) => {
    const key = resolve(ctx.cwd);
    if (exactSkillRead(event, ctx.cwd)) {
      activate();
      lastSnapshots.set(key, await captureWorkspaceSnapshot(ctx.cwd));
    }
    if (!event.isError && (event.toolName === "edit" || event.toolName === "write") && typeof event.input?.path === "string") {
      const path = normalizedPath(event.input.path, ctx.cwd);
      ledger.recordMutation({ path, category: classifyMutation(path), source: event.toolName });
      lastSnapshots.set(key, await captureWorkspaceSnapshot(ctx.cwd));
    }
    if (event.toolName === "bash" && registered) {
      const before = bashSnapshots.get(event.toolCallId) ?? lastSnapshots.get(key);
      bashSnapshots.delete(event.toolCallId);
      const after = await captureWorkspaceSnapshot(ctx.cwd);
      lastSnapshots.set(key, after);
      if ((before && snapshotsDiffer(before, after)) || looksLikeOpaqueMutation(event.input?.command)) {
        ledger.recordOpaqueMutation("A built-in bash command changed repository state or could not be reconstructed safely.");
      }
    }
  });
}
