# V1 Acceptance Contract and Upstream Inventory

Status: authorized implementation baseline

Package working name: `pi-test-driven-development`

Primary skill name: `test-driven-development`

## 1. Purpose

V1 provides a Pi-native, skill-only testing policy. It uses TDD when a valuable automated test can drive changed observable behavior, while selecting preservation, regression, validation-only, or verification-limited work when strict red-first TDD would be false or wasteful.

Tests follow observable contracts and plausible regression risk. They do not follow changed lines, file types, function counts, or coverage quotas. Agent uses Pi's built-in repository tools directly; package registers no custom tools or extension hooks.

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
- Built-in repository-tool use and truthful completion reporting.

Acceptance limits:

- Hard maximum: 6,000 UTF-8 bytes including frontmatter.
- Frontmatter description: at most 1,024 characters.
- Detailed workflows, test design, runners, failure handling, UI/content examples, and ecosystem examples live one reference level below `SKILL.md`.
- Examples load only when requested or when an unfamiliar ecosystem makes them useful.

## 9. Package scope and non-goals

V1 includes:

- Explicit Pi package manifest exposing one skill resource tree.
- One skill named `test-driven-development`.
- Progressive references.
- Direct guidance for Pi's built-in `read`, `bash`, `edit`, and `write` tools.
- TypeScript deterministic package/evaluation tests using Node's native test runner through `tsx`, plus `tsc --noEmit`.
- Preregistered routing and workflow fixtures.
- TypeScript evaluation harness built on Pi SDK session and built-in tool events.
- README with install, use, disable, remove, provenance, and evaluation limits.
- MIT license and bounded upstream inventory.

V1 excludes:

- Runtime extension, custom tool, output style, prompt template, theme, global instruction, or filesystem enforcement hook.
- Automatic revert/delete logic.
- Blocking or rewriting built-in `edit`, `write`, or `bash` calls to impose TDD sequence.
- Coverage quotas or tests-per-edit quotas.
- Publication, release, global installation, or modification of the currently installed global skill.
- Claims that static tests prove probabilistic routing or that model output proves semantic correctness in every repository.

Tool interception is rejected: it would duplicate Pi's built-ins, add model-facing schemas and bookkeeping calls, remain incomplete for shell-based edits and external tools, and be unsafe in dirty trees.

## 10. Built-in tool workflow contract

Package registers no model-facing tools. After skill loads, agent continues using Pi's existing tool set:

- Inspect repository status, docs, manifests, scripts, CI configuration, and existing tests with built-in `read` and read-only `bash`.
- Choose repository-native commands from source evidence; do not install a runner merely to satisfy process.
- State expected red reason before execution, then run exact focused and broader commands with built-in `bash`.
- Make visible source mutations with built-in `edit` or `write`, preserving unrelated dirty paths.
- Judge red semantically. Exit code and matching text cannot promote setup, syntax, flaky, timeout, or unrelated failures.
- Report exact observed commands and outcomes, pre-existing failures, and residual risk, then end with `Evidence: <label>` using strongest supported label.

No runtime ledger or package bookkeeping file is created. Built-in tool-event chronology supports evaluation, but opaque shell mutation or missing events must remain unsupported rather than inferred from final diff or prose.

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
- `evals/cases.json` fixes prompts, routing labels, expected modes, feature-specific red-output patterns, workspace overlays, and outcome contracts.
- `evals/v1-matrix.json` fixes providers, models, thinking levels, repetitions, isolation, and acceptance thresholds.

Required scenario coverage:

- Positive TDD: logic feature, reproducible bug, API/CLI contract, migration transformation, state/interaction change.
- No-new-test defaults: ordinary button copy, punctuation, CSS-only, docs/comment, generated/vendor output, dependency metadata with sufficient checks, test-only change.
- Mixed: accessibility label, legal warning, localization key, error contract, runtime config.
- Workflow/safety: pure refactor, existing user patch, dirty tree, passing-first test, unrelated baseline failure, flaky red, no runner, expensive integration.
- Anti-patterns: old-text-absence-only, tiny-copy snapshot, new framework for tiny edit, duplicate coverage, private-call assertions.
- Held-out cases not used for prompt tuning.

### 13.1 Static/package gates

- Manifest exposes exactly `./skills` through `pi.skills` and no runtime extension.
- Package contains one valid skill; references resolve one level below it.
- Skill names built-in repository tools and contains no custom advisory-tool dependency.
- Evaluation inference tests cover built-in valid and invalid red, preservation, regression, validation-only, opaque mutation, and truthful downgrade.
- Critical user-work safety, evidence honesty, mode, and contractual-copy boundaries are present.
- Static tests do not pretend required wording proves routing behavior.
- `npm pack --dry-run --json` includes runtime/docs and excludes tests, eval results, caches, prompt templates, and themes.

### 13.2 Live Pi routing gates

- Pi SDK sessions run in temporary fixture repositories with in-memory settings and sessions.
- `ModelRuntime` uses isolated copied auth/model catalog paths; global settings and packages are not loaded.
- Custom `ResourceLoader` exposes only package skill resources; ambient extensions, skills, prompts, themes, context files, trust, sessions, and startup network are absent.
- Skill loading is counted only from a successful `read` tool event for exact `SKILL.md`.
- Separate CLI/RPC and SDK smoke verifies package manifest discovery, exact skill command provenance, and unchanged built-in tool set under real Pi package loading.
- Each preregistered model/case cell runs three times.
- Each positive auto-route case loads in at least two of three repetitions per model.
- Negative cases never load in any repetition.
- Report precision, recall, false positives, false negatives, failed cells, and raw event-derived evidence separately for each model and overall.

### 13.3 Workflow outcome gates

Workspace fixtures evaluate observable artifacts and tool evidence, not response style alone:

- Required file state and preserved dirty/user files.
- Whether test files changed when required or stayed unchanged when a new test is not justified.
- TDD cases: test mutation, completed feature-specific failing command matching preregistered red-output evidence before production mutation starts, then focused green after production mutation completes.
- Preservation: green baseline before production mutation and relevant post-change green.
- Regression verification: useful test added without rewriting pre-existing implementation to manufacture red.
- Validation-only: desired artifact plus proportionate validation and no artificial permanent test.
- Verification-limited: strongest available validation plus explicit residual gap.
- Forbidden anti-pattern artifacts, including absence-only copy tests, whole-component snapshots for tiny copy, and newly introduced test frameworks for trivial edits.

Event ordering uses both tool start and completion sequence. Parallel overlap, opaque shell mutation, invalid or unrelated red, unsupported command composition, timed-out, failed, or missing evidence remains unsupported and blocks a complete V1 claim.

### 13.4 Matrix and claim rules

- At least two model configurations and three repetitions are preregistered.
- Matrix changes require a versioned amendment and reason; old raw results cannot be silently reused.
- Every completed output is included. Retries and failures remain visible.
- Results record Pi version, model identity, matrix/case/template hashes, package tree hash, duration, usage/cost when available, routing reads, mutation/test timeline, diff, outcome checks, and residual unsupported evidence.
- A smoke subset is diagnostic only. It cannot satisfy the full matrix.
- Structural tests are necessary but never sufficient evidence of routing precision or workflow quality.

## 14. Documentation and legal gates

README must document:

- Purpose, policy matrix, modes, evidence labels, and skill-only runtime boundary.
- Automatic model-dependent routing and deterministic `/skill:test-driven-development` invocation.
- Built-in tool workflow, repository-evidence limits, and ways to disable skill resources.
- Local, temporary, project, disable, and remove flows.
- Evaluation commands, cost warning, preregistration, smoke/full distinction, and honest current evidence.
- Upstream repository, exact commit, MIT attribution, and adaptation limits.
- No publish/release/global-install action without explicit approval.

MIT license must retain Jesse Vincent's applicable copyright notice.

## 15. Assumptions and open boundaries

Accepted V1 assumptions:

- Skill guidance is language-agnostic; examples are illustrative, not authoritative runner docs.
- Node.js, npm, Git, `tsx`, and TypeScript are available for package development and evaluation. Package does not rely on Node native TypeScript stripping.
- Pi loads package skill resources without a runtime extension.
- Pi SDK is the primary live-evaluation interface; Pi CLI is required for package-discovery smoke tests.
- Provider auth can be copied into an isolated temporary Pi config directory without changing global settings.
- Automatic routing is probabilistic; explicit invocation is deterministic.
- Built-in tool-event evidence cannot always reconstruct filesystem history, especially for opaque shell mutations; evaluation must mark unsupported evidence rather than guess.
- Runner discovery is based on repository docs, manifests, scripts, CI configuration, and existing tests; examples cannot encode every custom build system.
- Full live matrix has provider cost and can remain incomplete until explicitly run; incomplete evidence blocks release-quality routing claims, not package implementation.

Changes to product name, release scope, publication, blocking enforcement, global installation, or matrix labels require contract amendment and user approval where authority changes.
