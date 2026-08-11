# V1 Acceptance Contract and Upstream Inventory

Status: authorized implementation baseline

Package working name: `pi-test-driven-development`

Primary skill name: `test-driven-development`

## 1. Purpose

V1 provides a Pi-native testing-policy skill plus dynamically activated advisory tools. It uses TDD when a valuable automated test can drive changed observable behavior, while selecting preservation, regression, validation-only, or verification-limited work when strict red-first TDD would be false or wasteful.

Tests follow observable contracts and plausible regression risk. They do not follow changed lines, file types, function counts, or coverage quotas. Tools improve repository discovery and evidence bookkeeping; they do not replace engineering judgment.

## 2. Decision priority

Apply requirements in this order:

1. Preserve pre-existing and user work.
2. Obey repository constraints and avoid unsafe operations.
3. State evidence truthfully; never claim an unobserved red, green, or test result.
4. Protect important user, operator, and developer contracts.
5. Select durable confidence proportional to regression risk and verification cost.
6. Prefer stable, discriminating behavior checks over implementation or change detectors.
7. Keep the implementation and permanent test burden as small as the contract permits.

A lower priority cannot override a higher one. In particular, no agent may revert, delete, overwrite, or set aside pre-existing or user work solely to manufacture TDD provenance.

## 3. Test-value gate

Before adding a permanent test, determine:

1. Which observable user, operator, or developer contract changes or needs protection?
2. Which plausible regression would this test catch?
3. Is the assertion discriminating and stable: does it fail for meaningful wrong behavior rather than merely proving an edit occurred?
4. Does existing coverage already prove the contract?
5. Does durable confidence justify the test's write, run, and maintenance cost?

If these questions do not justify a permanent test, use proportionate repository-native validation instead. No coverage percentage or tests-per-edit quota can substitute for this decision.

## 4. Supported modes and truthful completion

| Mode | Use | Required evidence label |
|---|---|---|
| TDD | New or changed observable behavior, or reproducible bug, when a focused automated check is worthwhile and feasible | `tdd-attested` |
| Regression verification | Implementation or incoming patch already exists; useful tests now protect it without recreating history | `regression-verified` |
| Preservation | Pure refactor or internal restructuring; establish green baseline and keep it green | `preservation-verified` |
| Validation-only | No worthwhile new permanent test; use diff, render, build, lint, accessibility, existing checks, or focused manual evidence | `validation-only` |
| Verification-limited | Automated verification is unavailable, unsafe, flaky, infeasible, or disproportionately costly | `verification-limited` |

Completion evidence records, when applicable:

- Exact focused command.
- Expected red reason and observed failure reason.
- Focused green result.
- Broader relevant commands and why they were selected.
- Baseline, flaky, or unrelated failures.
- Manual or live validation performed.
- Residual risk and unverified areas.

Final diffs cannot prove historical tool order. `tdd-attested` is an execution attestation backed by observed session evidence, not a property inferred from code alone.

## 5. Default policy matrix

- **New or changed observable behavior:** write a focused desired-behavior test first; observe valid red; make a coherent minimal change; rerun focused and relevant regression checks.
- **Reproducible bug:** reproduce at the narrowest sufficient level, observe the bug-specific red, fix, then run relevant checks.
- **Pure refactor:** establish a green baseline. Add characterization only for meaningful uncovered risk. Keep checks green; never manufacture red.
- **Existing implementation, incoming patch, or user work:** preserve the tree. Add useful regression coverage when warranted, but report that work as regression verification rather than TDD.
- **Ordinary static copy, style, or formatting:** usually add no permanent test. Inspect the diff or rendered result and run proportionate existing checks.
- **Contractual copy:** accessibility names, legal or safety wording, localization, parser output, CLI/API output, error contracts, and explicit acceptance text can justify a user-facing contract test.
- **Config, schema, migration, dependency, and build changes:** classify observable risk, not extension. Use contract or integration tests when behavior changes; otherwise use existing build or validation checks.
- **Infeasible verification:** use the strongest safe alternate validation and state the gap.
- **Explicit strict-TDD request:** may override a default no-test route, but not safety, repository constraints, or evidence honesty.

A passing-first test is not red evidence. Diagnose existing behavior, a weak assertion, or a test that did not run. A flaky, setup, syntax, or unrelated failure is not valid red.

## 6. Test-design boundary

A permanent test earns its place by catching a named realistic break.

- Test public or user-observable behavior at the smallest sufficient level.
- Derive expected results independently of code under test.
- Prefer positive desired-state assertions.
- An absence assertion is meaningful only when absence itself is part of the contract; pair it with a positive desired-state assertion when practical.
- Permit coherent table-driven cases and multiple related assertions for one contract.
- Avoid private-call assertions, deep mock choreography, snapshots for tiny rules, duplicate coverage, source-text grep tests, and new test frameworks created solely for trivial edits.
- Prefer the repository's existing runner, fixtures, doubles, and conventions.

Button-copy boundary:

```js
expect(button).not.toHaveTextContent("Old label")
```

This is weak by itself: blank or arbitrary wrong text passes. Ordinary copy-only edits normally use render/diff validation without a new test. A stable accessibility contract can use `screen.getByRole("button", { name: "New label" })`. If old wording is legally or operationally forbidden, absence can be meaningful but should normally accompany the positive required wording.

## 7. Routing contract

Frontmatter is always visible to the model and must stay at or below Pi's 1,024-character limit.

Automatic activation includes main tasks that ask the agent to:

- Implement or change observable production behavior.
- Fix a reproducible production bug.
- Refactor production source while preserving behavior.
- Change contractual copy, runtime config, schemas, migrations, build behavior, or external contracts when observable risk changes.

Automatic activation excludes:

- Review or explanation only.
- Test-result interpretation.
- Code already written or test-only work.
- Documentation or comments only.
- Generated or vendor output.
- Ordinary copy, style, or formatting-only edits.

Exact `/skill:test-driven-development` invocation is deterministic and may evaluate an excluded case. Invocation does not authorize destruction of user work or false evidence claims. Automatic activation remains model-dependent.

## 8. Progressive disclosure budget

`SKILL.md` routes work and contains only hot policy:

- Routing and test-value gate.
- Mode decision.
- user-work safety boundary.
- Red validity and green/regression gate.
- Evidence labels.
- Exact reference-loading triggers.
- Exact advisory-tool loading and use triggers.

Acceptance limits:

- Hard maximum: 6,000 UTF-8 bytes including frontmatter.
- Frontmatter description: at most 1,024 characters.
- Detailed workflows, test design, runners, failure handling, UI/content examples, and ecosystem examples live one reference level below `SKILL.md`.
- Examples load only when requested or when an unfamiliar ecosystem makes them useful.

## 9. Package scope and non-goals

V1 includes:

- Explicit Pi package manifest exposing one skill resource tree and one TypeScript extension entrypoint.
- One skill named `test-driven-development`.
- Progressive references.
- Dynamically activated advisory tools for polyglot test-context discovery, mode selection, evidence-bearing command runs, and status reporting.
- TypeScript deterministic policy/package tests using Node's native test runner through `tsx`, plus `tsc --noEmit`.
- Preregistered routing and workflow fixtures.
- TypeScript evaluation harness built on Pi SDK session and tool events.
- README with install, use, disable, remove, provenance, and evaluation limits.
- MIT license and bounded upstream inventory.

V1 excludes:

- Output style, prompt template, theme, global instruction, or filesystem enforcement hook.
- Automatic revert/delete logic.
- Blocking or rewriting built-in edit, write, or bash calls to impose TDD sequence.
- Coverage quotas or tests-per-edit quotas.
- Publication, release, global installation, or modification of the currently installed global skill.
- Claims that static tests prove probabilistic routing or that model output proves semantic correctness in every repository.

Enforcing tool interception is rejected for V1: it would be intrusive, incomplete for shell-based edits and external tools, and unsafe in dirty trees. Advisory tools may downgrade unsupported evidence claims but never block normal project tools.

## 10. Advisory tool contract

Package extension defers advisory tool registration and activation until:

- A successful `read` tool result targets this package's exact `SKILL.md`; or
- Exact `/skill:test-driven-development` invocation resolves to this package's skill command provenance.

Activation registers each tool once and preserves every currently active tool. No package tool overrides a built-in tool. Additive dynamic-tool loading must not inject an always-on system prompt.

### 10.1 `test_context`

Perform a bounded, read-only repository scan and return evidence-backed candidates:

- Git root, dirty paths, and nested workspace roots.
- Manifests, lockfiles, test configs, existing test roots, and repository wrappers.
- Candidate focused, broader, build, lint, typecheck, accessibility, and validation commands with source path and confidence.
- Ambiguity, missing runner, unavailable dependency, and expensive or unsafe environment signals.

Initial recognizers cover repository-native signals for JavaScript/TypeScript, Python, Go, Rust, Ruby, Java/Kotlin with Gradle or Maven, .NET, Elixir, PHP, Swift, Dart/Flutter, Bazel, CMake/CTest, Make, Just, and Task. Recognition is evidence, not permission to execute. Unknown and polyglot repositories return bounded candidates instead of guessing. Tool never installs a framework or dependency.

### 10.2 `test_policy`

Accept structured task facts and return recommended mode, evidence label, required next proof, and unresolved questions. Inputs distinguish:

- Change kind and observable contract risk.
- New work, pure refactor, pre-existing implementation, or no production behavior.
- Existing coverage sufficiency.
- Automation feasibility, safety, flakiness, and proportional cost.
- Explicit strict-TDD request.

Result is deterministic for supplied facts, but supplied facts remain model/user assertions. Tool cannot decide product value or semantic contract importance without evidence.

### 10.3 `test_run`

Run the agent-selected repository command with explicit phase:

- `baseline`, `red`, `green`, `regression`, `broader`, or `validation`.
- Record exact command, cwd, start/end order, exit status, duration, bounded output, and declared expected red reason.
- Red is a supported candidate only when command exits nonzero and stable tokens from the predeclared expected-failure reason appear. Agent must still inspect semantic cause; token matching cannot promote setup, typo, flaky, or unrelated failure to valid red.
- Non-red phases expect exit zero but retain failures honestly.
- No command is selected or installed automatically.

Tool has same command-execution risk as built-in bash and must document it. Output follows Pi truncation limits. Cancellation and cwd are respected.

### 10.4 `test_status`

Summarize current session ledger:

- Recommended and supported evidence labels.
- Observed command phases and outcomes.
- Built-in edit/write mutations observed between phases, classified by discovered test paths when possible.
- Pre-existing, unrelated, flaky, or infrastructure failures.
- Opaque shell-mutation and unsupported-ordering warnings.
- Missing proof and residual risk.

`tdd-attested` requires observed valid red, subsequent production mutation through observable tool evidence, and later focused green. When sequence cannot be established, status downgrades to the strongest supported label. This is bounded session evidence, not proof of semantic test quality.

Tool state persists through tool-result details for session branching and reconstructs on session start. No global or project file is modified for bookkeeping.

## 11. Upstream pin and provenance

| Field | Value |
|---|---|
| Project | `obra/superpowers` |
| Repository | `https://github.com/obra/superpowers` |
| Reviewed commit | `44c9b2d6e889982ac18c27d05a19fefe335194e1` |
| Reviewed paths | `skills/test-driven-development/SKILL.md`, `skills/test-driven-development/writing-good-tests.md`, `LICENSE` |
| License | MIT |
| Upstream copyright | Copyright (c) 2025 Jesse Vincent |
| Review date | 2026-08-11 |

Current installed local skill at `/Users/stijn/.pi/agent/skills/test-driven-development` has no recorded Git provenance. Its exact iron-law wording, section structure, red/green rules, rationalization table, and delete/restart rule show strong lineage from `obra/superpowers`. V1 therefore treats inherited structure and substantially adapted testing guidance as upstream-derived unless independently rewritten and records the pinned upstream source conservatively.

### 11.1 Material adapted

| Source | V1 destination | Treatment |
|---|---|---|
| Upstream `SKILL.md` — red/green validation, focused behavior tests, evidence honesty | `SKILL.md`, `references/workflow.md`, `references/failure-modes.md` | Adapt. Keep valid-red discipline; replace universal mandate and deletion rule with risk judgment and user-work safety. |
| Upstream `SKILL.md` — refactor and existing-code handling | `references/refactoring.md`, `references/regression-evaluation.md` | Substantially revise. Pure refactor starts green; existing work is preserved. |
| Upstream `writing-good-tests.md` — name the break, behavior over text, independent expectations, doubles guidance | `references/test-design.md`, `references/ui-content.md` | Adapt. Retain discriminating-test principle while adding cost, duplicate-coverage, and contractual-copy boundaries. |
| Installed local `refs/runners.md` | `references/runners.md` | Adapt runner examples and repository-native command priority. |
| Installed local language examples | `references/examples.md` | Condense; load only on request or unfamiliar ecosystems. |
| Upstream `LICENSE` | `LICENSE` | Retain MIT terms and attribution. |

### 11.2 Material used only as evidence

- Upstream diagrams and examples inform workflow review but need not be copied.
- Installed local skill files establish lineage and failure modes but are not authoritative policy.
- External testing sources inform boundaries; this package does not claim those authors endorse this adaptation.

### 11.3 Material rejected

- “Use for any production-code change.”
- “NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST” as a universal law.
- Delete, revert, or hide existing/user work to recreate red-first history.
- Categorical rejection of “too small.”
- One-test/one-assertion rigidity.
- Automated coverage for every changed line, function, wording choice, or internal refactor.
- Passing static source-text tests as evidence of agent behavior.

## 12. Research basis

Reviewed 2026-08-11:

- Kent Beck, [Canon TDD](https://newsletter.kentbeck.com/p/canon-tdd): TDD starts from desired behavior change and a scenario list; one runnable test drives each behavior increment; refactoring follows green. Beck also states this workflow is not a universal gold-star mandate.
- Kent Beck and Kelly Sutton, [Test Desiderata](https://testdesiderata.com/): valuable tests are behavioral, structure-insensitive, writable, deterministic, predictive, and confidence-inspiring; these properties can trade off.
- Google, [Software Engineering at Google, Chapter 12](https://abseil.io/resources/swe-book/html/ch12.html): ideal tests change only when requirements change; pure refactors should not require test edits; public-API tests reduce brittleness; poor tests impose maintenance cost.
- Google, [Chapter 11](https://abseil.io/resources/swe-book/html/ch11.html): automated testing supports confident change, but unhealthy suites can become productivity sinks and lose trust.
- Martin Fowler, [Test Coverage](https://martinfowler.com/bliki/TestCoverage.html): numeric targets invite low-quality tests; coverage finds untested areas but cannot establish test quality or sufficiency.
- Martin Fowler, [Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html): use different test granularities and fewer high-level tests; names and exact mix depend on system context.
- Testing Library, [Guiding Principles](https://testing-library.com/docs/guiding-principles): tests resembling real software use provide more confidence than component-instance or implementation-oriented tests.

No reviewed primary source supports a blanket claim that copy edits never need tests. V1 uses contract, risk, stability, and cost instead.

Agent-specific reproduction-test evidence remains secondary and provisional. V1 makes no claim that blanket agent-generated tests improve all patches.

## 13. Evaluation contract

Preregister before editing skill prompts:

- `evals/fixtures/templates.json` fixes reusable fixture-repository baselines.
- `evals/cases.json` fixes prompts, routing labels, expected modes, workspace overlays, and outcome contracts.
- `evals/v1-matrix.json` fixes providers, models, thinking levels, repetitions, isolation, and acceptance thresholds.

Required scenario coverage:

- Positive TDD: logic feature, reproducible bug, API/CLI contract, migration transformation, state/interaction change.
- No-new-test defaults: ordinary button copy, punctuation, CSS-only, docs/comment, generated/vendor output, dependency metadata with sufficient checks, test-only change.
- Mixed: accessibility label, legal warning, localization key, error contract, runtime config.
- Workflow/safety: pure refactor, existing user patch, dirty tree, passing-first test, unrelated baseline failure, flaky red, no runner, expensive integration.
- Anti-patterns: old-text-absence-only, tiny-copy snapshot, new framework for tiny edit, duplicate coverage, private-call assertions.
- Held-out cases not used for prompt tuning.

### 13.1 Static/package gates

- Manifest exposes exactly `./skills` through `pi.skills` and one intended TypeScript entrypoint through `pi.extensions`.
- Package contains one valid skill; references resolve one level below it.
- Extension registers exactly the advisory tool surface only after package skill provenance activates it.
- Polyglot recognizer fixtures cover every declared ecosystem and bounded unknown/monorepo behavior.
- Evidence ledger tests cover valid and invalid red, preservation, regression, validation-only, opaque mutation, branch reconstruction, and truthful downgrade.
- Critical user-work safety, evidence honesty, mode, and contractual-copy boundaries are present.
- Static tests do not pretend required wording proves routing behavior.
- `npm pack --dry-run --json` includes runtime/docs and excludes tests, eval results, caches, prompt templates, and themes.

### 13.2 Live Pi routing gates

- Pi SDK sessions run in temporary fixture repositories with in-memory settings and sessions.
- `ModelRuntime` uses isolated copied auth/model catalog paths; global settings and packages are not loaded.
- Custom `ResourceLoader` exposes only package skill and extension; ambient extensions, skills, prompts, themes, context files, trust, sessions, and startup network are absent.
- Skill loading is counted only from a successful `read` tool event for exact `SKILL.md`.
- Separate CLI/RPC smoke verifies package manifest discovery, exact skill command provenance, and dynamic tool activation under real Pi package loading.
- Each preregistered model/case cell runs three times.
- Each positive auto-route case loads in at least two of three repetitions per model.
- Negative cases never load in any repetition.
- Report precision, recall, false positives, false negatives, failed cells, and raw event-derived evidence separately for each model and overall.

### 13.3 Workflow outcome gates

Workspace fixtures evaluate observable artifacts and tool evidence, not response style alone:

- Required file state and preserved dirty/user files.
- Whether test files changed when required or stayed unchanged when a new test is not justified.
- TDD cases: test mutation and behavior-specific failing command before production mutation, then focused green after production mutation, when event evidence supports that ordering.
- Preservation: green baseline before production mutation and relevant post-change green.
- Regression verification: useful test added without rewriting pre-existing implementation to manufacture red.
- Validation-only: desired artifact plus proportionate validation and no artificial permanent test.
- Verification-limited: strongest available validation plus explicit residual gap.
- Forbidden anti-pattern artifacts, including absence-only copy tests, whole-component snapshots for tiny copy, and newly introduced test frameworks for trivial edits.

Event ordering is marked unsupported rather than guessed when a model mutates files through an opaque shell command. Unsupported, timed-out, failed, or missing cells remain visible and block a complete V1 claim.

### 13.4 Matrix and claim rules

- At least two model configurations and three repetitions are preregistered.
- Matrix changes require a versioned amendment and reason; old raw results cannot be silently reused.
- Every completed output is included. Retries and failures remain visible.
- Results record Pi version, model identity, matrix/case/template hashes, package tree hash, duration, usage/cost when available, routing reads, mutation/test timeline, diff, outcome checks, and residual unsupported evidence.
- A smoke subset is diagnostic only. It cannot satisfy the full matrix.
- Structural tests are necessary but never sufficient evidence of routing precision or workflow quality.

## 14. Documentation and legal gates

README must document:

- Purpose, policy matrix, modes, evidence labels, and advisory-tool boundaries.
- Automatic model-dependent routing and deterministic `/skill:test-driven-development` invocation.
- Dynamic tool activation, polyglot recognition limits, command-execution risk, and ways to disable extension independently.
- Local, temporary, project, disable, and remove flows.
- Evaluation commands, cost warning, preregistration, smoke/full distinction, and honest current evidence.
- Upstream repository, exact commit, MIT attribution, and adaptation limits.
- No publish/release/global-install action without explicit approval.

MIT license must retain Jesse Vincent's applicable copyright notice.

## 15. Assumptions and open boundaries

Accepted V1 assumptions:

- Skill guidance is language-agnostic; examples are illustrative, not authoritative runner docs.
- Node.js, npm, Git, `tsx`, and TypeScript are available for package development and evaluation. Package does not rely on Node native TypeScript stripping.
- Pi loads the shipped TypeScript extension through its documented jiti runtime.
- Pi SDK is the primary live-evaluation interface; Pi CLI is required for package-discovery smoke tests.
- Provider auth can be copied into an isolated temporary Pi config directory without changing global settings.
- Automatic routing is probabilistic; explicit invocation is deterministic.
- Tool-event evidence cannot always reconstruct filesystem history, especially for opaque shell mutations; advisory status must downgrade rather than guess.
- Polyglot command discovery is based on bounded repository signals and cannot encode every custom build system.
- Full live matrix has provider cost and can remain incomplete until explicitly run; incomplete evidence blocks release-quality routing claims, not package implementation.

Changes to product name, release scope, publication, blocking enforcement, global installation, or matrix labels require contract amendment and user approval where authority changes.
