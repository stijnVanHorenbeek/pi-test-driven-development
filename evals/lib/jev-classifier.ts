import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { askJev, buildRequest, validateResponse, type JevRequest, type JevResponse, type PilotExample } from "../jev/judge.ts";
import { sha256 } from "./runner.ts";
import { candidateRedRuns, inferObservedWorkflow } from "./sdk-runner.ts";
import type { EvaluationCase } from "./spec.ts";

const labels = "tdd-attested|regression-verified|preservation-verified|validation-only|verification-limited";
// Conservative pilot guard, not a calibrated accuracy guarantee; review more traces before changing it.
const minimumConfidence = 0.8;

// Presence is a code-owned prerequisite. Never ask Jev to map a label that the agent didn't write.
export function literalClaims(text: string) {
  const plain = text.replace(/[`*]/g, "");
  return [...plain.matchAll(/\bEvidence(?: label)?\s*:[ \t]*([^\n]*)/gi)].map((match) => {
    const label = match[1]!.match(new RegExp(`\\b(${labels})\\b`, "gi"));
    return label?.length === 1 ? { label: label[0]!.toLowerCase(), line: match[0]!.trim() } : null;
  });
}

interface Attempt {
  response?: { finalText?: string; timeline?: Parameters<typeof inferObservedWorkflow>[0] };
}

interface Judgment {
  kind: PilotExample["kind"];
  requestHash: string;
  source: "cached" | "live";
  answers: JevResponse["answers"];
  model: string;
  usage: JevResponse["usage"];
  attempts: number;
}

export async function classifyAttempt(
  attempt: Attempt,
  item: Pick<EvaluationCase, "task" | "expected">,
  cacheDir: string,
  apiKey = "",
  fetcher: typeof fetch = fetch,
) {
  const text = attempt.response?.finalText ?? "";
  const timeline = attempt.response?.timeline ?? [];
  const claims = literalClaims(text);
  const judgments: Judgment[] = [];
  async function judge(example: PilotExample) {
    const request: JevRequest = buildRequest(example);
    const requestHash = sha256(JSON.stringify(request));
    const path = join(cacheDir, `${requestHash}.json`);
    let response: JevResponse;
    let source: Judgment["source"];
    let attempts: number;
    try {
      const cached = JSON.parse(await readFile(path, "utf8"));
      assert.equal(sha256(JSON.stringify(cached.request)), requestHash);
      response = validateResponse(request, cached.response);
      attempts = cached.attempts;
      source = "cached";
    } catch (error: any) {
      if (error.code !== "ENOENT") throw new Error(`Invalid Jev cache ${requestHash}; refusing to overwrite it`);
      const result = await askJev(request, apiKey, fetcher);
      ({ response, attempts } = result);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ request, ...result }, null, 2)}\n`);
      await rename(temporary, path);
      source = "live";
    }
    judgments.push({ kind: example.kind, requestHash, source, answers: response.answers, model: response.model, usage: response.usage, attempts });
    return response.answers;
  }

  let finalText = text;
  let invalidClaim = claims.some((claim) => claim === null);
  if (item.expected.scopes?.length && !invalidClaim && claims.length) {
    const scopes = Object.fromEntries(item.expected.scopes.map((scope, index) => [`scope_${index}`, scope.name]));
    const answers = await judge({ id: "scope", kind: "scope", state: { text, scopes, claims: claims.map((claim) => claim!.line) }, expected: {}, reviewNote: "" });
    const mappings = claims.map((claim, index) => {
      const answer = answers[`claim_${index}`];
      const choice = answer?.confidence >= minimumConfidence ? answer.choice : undefined;
      const name = /^scope_\d+$/.test(choice ?? "") ? scopes[choice!] : undefined;
      return name ? `Evidence: ${claim!.label} — ${name}` : null;
    });
    invalidClaim = mappings.some((mapping) => !mapping);
    // Keep all non-claim prose for gap interpretation; only reformat labels Jev actually mapped.
    finalText = text.replace(/^.*\bEvidence(?: label)?\s*:.*$/gmi, "") + "\n" + mappings.filter(Boolean).join("\n");
  }
  const redFailures: number[] = [];
  const needsRed = claims.some((claim) => claim?.label === "tdd-attested");
  if (needsRed) {
    for (const run of candidateRedRuns(timeline, item.expected.scopes)) {
      const answers = await judge({ id: "red", kind: "failure", state: {
        text: run.output, contract: item.task, truncated: run.output.includes("…"),
      }, expected: {}, reviewNote: "" });
      if (answers.failure?.choice === "contract_failure" && answers.failure.confidence >= minimumConfidence) redFailures.push(run.sequence);
    }
  }
  let gapAcknowledged: boolean | undefined;
  const gapAcknowledgedByScope: Record<string, boolean> = {};
  if (claims.some((claim) => claim?.label === "verification-limited")) {
    const scopes = item.expected.scopes?.filter((scope) => scope.mode === "verification-limited");
    for (const scope of scopes?.map((scope) => scope.name) ?? [item.task]) {
      const answers = await judge({ id: "gap", kind: "gap", state: { text, scope }, expected: {}, reviewNote: "" });
      const acknowledged = answers.gap?.choice === "acknowledged_gap" && answers.gap.confidence >= minimumConfidence;
      if (scopes) gapAcknowledgedByScope[scope] = acknowledged;
      else gapAcknowledged = acknowledged;
    }
  }
  const workflow = invalidClaim
    ? inferObservedWorkflow(timeline, "", item.expected.red_output_pattern, item.expected.scopes)
    : inferObservedWorkflow(timeline, finalText, item.expected.red_output_pattern, item.expected.scopes, { redFailures, gapAcknowledged, gapAcknowledgedByScope });
  return { workflow, judgments, literalClaims: claims, invalidClaim };
}
