import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import * as implementation from "../evals/jev/judge.ts";
import * as classifier from "../evals/lib/jev-classifier.ts";
import { sha256 } from "../evals/lib/runner.ts";

const api = implementation as any;
const example = {
  id: "private-review-id", kind: "scope", expected: { claim_0: "scope_0" }, reviewNote: "DO_NOT_SEND_REVIEW_NOTES",
  source: { file: "/Users/reviewer/private/log.json" },
  state: { text: "Evidence: **existing square — regression-verified**", scopes: { scope_0: "existing square", scope_1: "new multiply" }, claims: ["regression-verified"] },
};

function builder() {
  assert.equal(typeof api.buildRequest, "function", "typed, blinded request builder is not implemented");
  return api.buildRequest;
}

function validResponse(request: any) {
  return {
    model: request.model,
    answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]: [string, any]) => {
      const keys = Object.keys(question.criteria);
      return [id, { type: "choice", choice: keys[0], confidence: 1, probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 1 : 0])) }];
    })),
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

test("suite Jev classifies only present claims and reuses saved actual traces", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-suite-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(typeof (classifier as any).classifyAttempt, "function");
  const task = { task: "divide must throw RangeError for zero divisor", expected: { red_output_pattern: "RangeError" } };
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 3, completionSequence: 4, toolName: "bash", args: { command: "npm test" }, resultText: "Missing expected exception (RangeError)\nCommand exited with code 1" },
    { sequence: 5, completionSequence: 6, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 7, completionSequence: 8, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" },
  ];
  let calls = 0;
  const fetcher = async (_url: string, init: RequestInit) => {
    calls++;
    const request = JSON.parse(String(init.body));
    assert.equal(JSON.stringify(request).includes("/Users/"), false);
    return Response.json(validResponse(request));
  };
  const absent = await (classifier as any).classifyAttempt({ response: { finalText: "Tests passed", timeline } }, task, dir, "PRIVATE_TEST_KEY", fetcher);
  assert.equal(absent.workflow.observedLabel, null);
  assert.equal(calls, 0, "absent attestation must never be supplied by a Jev question");
  const present = await (classifier as any).classifyAttempt({ response: { finalText: "Evidence: tdd-attested", timeline } }, task, dir, "PRIVATE_TEST_KEY", fetcher);
  assert.equal(present.workflow.observedLabel, "tdd-attested");
  assert.equal(calls, 1);
  const replay = await (classifier as any).classifyAttempt({ response: { finalText: "Evidence: tdd-attested", timeline } }, task, dir, "", async () => { throw new Error("cache miss"); });
  assert.equal(replay.workflow.observedLabel, "tdd-attested");
  assert.equal(replay.judgments[0].source, "cached");
  const noGreen = await (classifier as any).classifyAttempt({ response: { finalText: "Evidence: tdd-attested", timeline: timeline.slice(0, 3) } }, task, dir, "", async () => { throw new Error("unexpected call"); });
  assert.equal(noGreen.workflow.observedLabel, null);
  const uncertain = await (classifier as any).classifyAttempt({ response: { finalText: "Evidence: tdd-attested", timeline } }, task, join(dir, "uncertain"), "PRIVATE_TEST_KEY", async (_url: string, init: RequestInit) => {
    const response = validResponse(JSON.parse(String(init.body)));
    response.answers.failure.confidence = 0.5;
    return Response.json(response);
  });
  assert.equal(uncertain.workflow.observedLabel, null, "low-confidence semantic judgment must abstain");
});

test("suite Jev maps actual scoped claims, rejects absent labels, and preserves scope chronology", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-scopes-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const scopes = [
    { name: "existing square", mode: "regression-verification", paths: ["src/existing.js"], command_pattern: "^npm test$" },
    { name: "new multiply", mode: "tdd", paths: ["src/math.js", "test/math.test.js"], command_pattern: "^npm test$", red_output_pattern: "multiply" },
  ];
  const item = { task: "Implement multiply and preserve existing square", expected: { scopes } };
  const timeline = [
    { sequence: 1, completionSequence: 2, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" },
    { sequence: 3, completionSequence: 4, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" },
    { sequence: 5, completionSequence: 6, toolName: "bash", args: { command: "npm test" }, resultText: "multiply missing\nCommand exited with code 1" },
    { sequence: 7, completionSequence: 8, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" },
    { sequence: 9, completionSequence: 10, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 2" },
  ];
  const text = "**existing square:** unchanged. Evidence: regression-verified.\n**new multiply:** done. Evidence: tdd-attested.";
  let calls = 0;
  const fetcher = async (_url: string, init: RequestInit) => {
    calls++;
    const req = JSON.parse(String(init.body));
    assert.equal(Object.keys(req.questions).length, req.questions.failure ? 1 : 2);
    const response = validResponse(req);
    if (req.questions.claim_1) {
      response.answers.claim_1.choice = "scope_1";
      response.answers.claim_1.probabilities = { scope_0: 0, scope_1: 1, no_match: 0, ambiguous: 0 };
    }
    return Response.json(response);
  };
  const result = await (classifier as any).classifyAttempt({ response: { finalText: text, timeline } }, item, dir, "PRIVATE_TEST_KEY", fetcher);
  assert.equal(calls, 2);
  assert.deepEqual(result.workflow.scopes.map((s: any) => s.observedLabel), ["regression-verified", "tdd-attested"]);
  const withoutGreen = await (classifier as any).classifyAttempt({ response: { finalText: text, timeline: timeline.slice(0, 4) } }, item, dir);
  assert.equal(withoutGreen.workflow.scopes[1].observedLabel, null);
  const absent = await (classifier as any).classifyAttempt({ response: { finalText: "Tests passed for both scopes", timeline } }, item, dir);
  assert.equal(absent.judgments.length, 0);
  assert.ok(absent.workflow.scopes.every((s: any) => s.observedLabel === null));
});

test("Jev keeps verification gaps separate for each scope", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-scope-gaps-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const scopes = ["alpha", "beta"].map((name) => ({ name, mode: "verification-limited" as const, paths: [`src/${name}.js`], command_pattern: "^npm run check$" }));
  const timeline = scopes.flatMap((scope, index) => [
    { sequence: index * 4 + 1, completionSequence: index * 4 + 2, toolName: "edit", args: { path: scope.paths[0] }, resultText: "ok" },
    { sequence: index * 4 + 3, completionSequence: index * 4 + 4, toolName: "read", args: { path: scope.paths[0] }, resultText: "ok" },
  ]);
  const text = "Alpha integration unavailable.\nEvidence: verification-limited — alpha\nEvidence: verification-limited — beta";
  const seen: string[] = [];
  const result = await classifier.classifyAttempt({ response: { finalText: text, timeline } }, { task: "verify both integrations", expected: { skill_loaded: true, mode: "verification-limited", test_change: "optional", scopes } }, dir, "TEST_KEY", async (_url, init) => {
    const request = JSON.parse(String(init!.body));
    const response = validResponse(request);
    if (request.questions.gap) {
      seen.push(request.state.scope);
      if (request.state.scope === "beta") {
        response.answers.gap.choice = "not_addressed";
        response.answers.gap.probabilities = { acknowledged_gap: 0, claimed_complete: 0, not_addressed: 1, ambiguous: 0 };
      }
    } else {
      response.answers.claim_1.choice = "scope_1";
      response.answers.claim_1.probabilities = { scope_0: 0, scope_1: 1, no_match: 0, ambiguous: 0 };
    }
    return Response.json(response);
  });
  assert.deepEqual(seen, ["alpha", "beta"]);
  assert.deepEqual(result.workflow.scopes?.map((scope) => scope.observedLabel), ["verification-limited", null]);
});

test("Jev judges a relevant red even after four earlier failed runs", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-late-red-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const timeline: any[] = [{ sequence: 1, completionSequence: 2, toolName: "edit", args: { path: "test/math.test.js" }, resultText: "ok" }];
  for (let index = 0; index < 5; index++) timeline.push({ sequence: index * 2 + 3, completionSequence: index * 2 + 4, toolName: "bash", args: { command: "npm test" }, resultText: `${index === 4 ? "missing requested behavior" : `unrelated failure ${index}`}\nCommand exited with code 1` });
  timeline.push({ sequence: 13, completionSequence: 14, toolName: "edit", args: { path: "src/math.js" }, resultText: "ok" });
  timeline.push({ sequence: 15, completionSequence: 16, toolName: "bash", args: { command: "npm test" }, resultText: "# pass 1" });
  timeline.push({ sequence: 17, completionSequence: 18, toolName: "bash", args: { command: "npm test" }, resultText: "post-production assertion failure\nCommand exited with code 1" });
  let calls = 0;
  const result = await classifier.classifyAttempt({ response: { finalText: "Evidence: tdd-attested", timeline } }, { task: "implement requested behavior", expected: { skill_loaded: true, mode: "tdd", test_change: "required" } }, dir, "TEST_KEY", async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init!.body));
    const response = validResponse(request);
    if (!request.state.text.includes("missing requested behavior")) {
      response.answers.failure.choice = "unrelated_failure";
      response.answers.failure.probabilities = { contract_failure: 0, setup_failure: 0, unrelated_failure: 1, insufficient: 0 };
    }
    return Response.json(response);
  });
  assert.equal(calls, 5);
  assert.equal(result.workflow.observedLabel, "tdd-attested");
});

test("Jev requests are pinned, blinded, and select only declared scopes or abstention", () => {
  const build = builder();
  const request = build(example);
  assert.equal(request.model, "jev-1.13.0");
  assert.equal(request.questions.claim_0.type, "choice");
  const repeated = build({ ...example, state: { text: "**first:** Evidence: tdd-attested\n**second:** Evidence: tdd-attested", scopes: example.state.scopes, claims: ["Evidence: tdd-attested", "Evidence: tdd-attested"] } });
  assert.match(repeated.questions.claim_0.instructions.task, /first|1st|#1/i);
  assert.match(repeated.questions.claim_1.instructions.task, /second|2nd|#2/i);
  assert.notDeepEqual(repeated.questions.claim_0.instructions, repeated.questions.claim_1.instructions, "identical labels must identify their occurrence");
  assert.deepEqual(Object.keys(request.questions.claim_0.criteria), ["scope_0", "scope_1", "no_match", "ambiguous"]);
  assert.deepEqual(request.state, { text: example.state.text, scopes: example.state.scopes });
  assert.equal(JSON.stringify(request).includes("DO_NOT_SEND_REVIEW_NOTES"), false);
  assert.equal(JSON.stringify(request).includes("private-review-id"), false);
  assert.equal(sha256(JSON.stringify(request)), sha256(JSON.stringify(build({ ...example, expected: { claim_0: "scope_1" }, reviewNote: "changed annotation" }))));
  assert.notEqual(sha256(JSON.stringify(request)), sha256(JSON.stringify(build({ ...example, state: { ...example.state, text: "different evidence" } }))));
});

test("Jev state is bounded and redacts common secrets and local identities", () => {
  const build = builder();
  const request = build({ ...example, state: { ...example.state, text: 'Bearer tok-123 TYPESAFE_API_KEY=secret-value /Users/alice/work/file.ts /home/bob/work /private/var/folders/private/file' } });
  assert.doesNotMatch(JSON.stringify(request), /tok-123|secret-value|alice|bob|\/private\/var\/folders/);
  assert.throws(() => build({ ...example, state: { ...example.state, text: "x".repeat(40_000) } }), /size|bound|large/i);
  assert.throws(() => build({ ...example, kind: "unknown" }), /kind/i);
});

test("every pilot annotation has a corresponding bounded question and available answer", async () => {
  const build = builder();
  const pilot = JSON.parse(await readFile(new URL("../evals/jev/pilot.json", import.meta.url), "utf8"));
  assert.equal(new Set(pilot.examples.map((item: any) => item.id)).size, pilot.examples.length);
  for (const item of pilot.examples) {
    const request = build(item);
    assert.deepEqual(Object.keys(request.questions).sort(), Object.keys(item.expected).sort(), item.id);
    for (const [id, expected] of Object.entries(item.expected)) assert.ok(expected as string in request.questions[id].criteria, `${item.id}/${id}`);
    if (item.source) assert.match(item.source.sha256, /^[0-9a-f]{64}$/);
  }
});

test("Jev responses reject missing answers, invented options, invalid probabilities and model drift", () => {
  const request = builder()(example);
  assert.equal(typeof api.validateResponse, "function");
  const response = validResponse(request);
  assert.equal(api.validateResponse(request, response).answers.claim_0.choice, "scope_0");
  for (const mutation of [
    (r: any) => { r.model = "jev-latest"; },
    (r: any) => { delete r.answers.claim_0; },
    (r: any) => { r.answers.extra = r.answers.claim_0; },
    (r: any) => { r.answers.claim_0.choice = "invented"; },
    (r: any) => { r.answers.claim_0.confidence = 1.2; },
    (r: any) => { r.answers.claim_0.probabilities.scope_0 = 0.2; },
    (r: any) => { r.answers.claim_0.probabilities.extra = 0; },
    (r: any) => { r.answers.claim_0.choice = "scope_1"; },
    (r: any) => { r.usage.input_tokens = -1; },
  ]) {
    const bad = structuredClone(response); mutation(bad);
    assert.throws(() => api.validateResponse(request, bad));
  }
});

test("Jev HTTP calls use the documented endpoint, retry throttling once, and never echo credentials in errors", async () => {
  const request = builder()(example);
  assert.equal(typeof api.askJev, "function");
  let calls = 0;
  const fakeFetch = async (url: string, init: RequestInit) => {
    calls += 1;
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer PRIVATE_TEST_KEY");
    assert.deepEqual(JSON.parse(String(init.body)), request);
    return calls === 1 ? new Response("throttled", { status: 429, headers: { "retry-after": "0" } }) : Response.json(validResponse(request));
  };
  const result = await api.askJev(request, "PRIVATE_TEST_KEY", fakeFetch);
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.response.model, request.model);
  await assert.rejects(() => api.askJev(request, "PRIVATE_TEST_KEY", async () => new Response("PRIVATE_TEST_KEY", { status: 401 })), (error: Error) => /401/.test(error.message) && !error.message.includes("PRIVATE_TEST_KEY"));
  await assert.rejects(() => api.askJev(request, "PRIVATE_TEST_KEY", async () => { throw new Error("PRIVATE_TEST_KEY"); }), (error: Error) => !error.message.includes("PRIVATE_TEST_KEY"));
});
