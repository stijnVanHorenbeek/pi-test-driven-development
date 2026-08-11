---
name: test-driven-development
description: >-
  Auto-use when main task asks agent to implement or change observable production behavior,
  fix a reproducible bug, or refactor production source while preserving behavior. Load before
  production edits to choose TDD, preservation, or proportionate validation. Do not auto-use for
  review/explanation only, test-result interpretation, code already written or test-only work,
  docs/comments-only edits, generated/vendor output, or ordinary copy/style/format-only changes.
  Contractual copy, runtime config, schemas, migrations, and build behavior still qualify when
  observable risk changes. Explicit invocation may evaluate excluded cases. Never discard
  pre-existing/user work or claim unobserved red/green evidence.
license: MIT
---

# Risk-based test-driven development

## Goal

Tests follow observable contract and plausible regression risk—not changed lines, file types,
function counts, or coverage quotas. Use TDD where a valuable automated check can drive behavior.
Use preservation, regression verification, or proportionate validation when red-first TDD would
be false or wasteful.

## Safety boundary

Inspect repository state before editing. Never revert, delete, overwrite, hide, or set aside
pre-existing or user work solely to recreate test-first history. Preserve incoming patches and
dirty-tree changes. Never claim a red, green, baseline, or command result you did not observe.
Repository and user constraints outrank this workflow.

## Test-value gate

Before adding a permanent test, answer:

1. Which user, operator, or developer contract changes or needs protection?
2. Which plausible regression would test catch?
3. Is assertion stable and discriminating—wrong behavior fails, not merely old text disappears?
4. Does existing coverage already prove contract?
5. Does durable confidence justify write, run, and maintenance cost?

If no worthwhile permanent test remains, choose proportionate existing, static, rendered, manual,
or live validation. Do not add a framework or snapshot merely to prove an edit occurred.

## Select mode

| Situation | Mode | Evidence label |
|---|---|---|
| New/changed observable behavior or reproducible bug; useful automation feasible | TDD | `tdd-attested` |
| Implementation or incoming patch already exists | Regression verification | `regression-verified` |
| Pure refactor/internal restructuring | Preservation | `preservation-verified` |
| No worthwhile new permanent test | Validation-only | `validation-only` |
| Verification unavailable, unsafe, flaky, infeasible, or disproportionate | Verification-limited | `verification-limited` |

Defaults:

- Behavior or bug: desired behavior test first; valid red; coherent minimal green; relevant checks.
- Refactor: green baseline, then green preservation checks. No artificial red.
- Existing code/user patch: preserve it; add useful regression coverage if warranted. Do not claim TDD.
- Ordinary static copy/style/format: usually no new test. Inspect artifact and run proportionate checks.
- Accessibility names, legal/safety text, localization, parser/CLI/API/error output: test stable
  user-facing contract when importance justifies maintenance.
- Config/schema/migration/dependency/build: classify observable risk, not extension.
- Explicit strict-TDD request can override default no-test routing, never safety or evidence honesty.

A test may contain coherent table cases or multiple related assertions for one contract. “One test
per behavior” is scope guidance, not assertion-count law.

## Valid evidence

A valid red means intended test ran and failed for expected missing/broken behavior. Passing-first,
syntax, setup, flaky, or unrelated failure is not red. Diagnose before production edits.

Green means focused behavior check passes, relevant surrounding checks pass, and important failures
are not hidden. For preservation, both baseline and post-change checks stay green. When automation
cannot establish enough confidence, use strongest safe alternative and state residual risk.

Completion record should name exact focused command, expected/observed red reason when applicable,
green or validation result, broader commands and rationale, pre-existing failures, and residual risk.
Final diff alone cannot prove historical TDD sequence.

## Advisory tools

Package extension keeps these tools inactive until this skill loads:

- `test_context`: inspect polyglot repository runners, wrappers, test roots, workspaces, and dirty state.
- `test_policy`: map explicit task facts to mode and evidence requirements.
- `test_run`: execute exact chosen command in `baseline`, `red`, `green`, `regression`, `broader`,
  or `validation` phase and retain bounded evidence.
- `test_status`: report strongest label supported by observed ledger and missing proof.

Use `test_context` when setup/scope is unclear and `test_policy` for mixed boundaries. For TDD or
preservation, use `test_run` for phase commands unless runner needs unsupported interaction. Use
`test_status` before completion; if skipped, do not claim evidence label. Tools remain advisory:
supplied facts can be wrong, failure cause needs judgment, and opaque shell mutation forces downgrade.

## Load references narrowly

- `references/workflow.md` — active feature or bug TDD.
- `references/regression-evaluation.md` — existing patches, legacy code, or later coverage.
- `references/refactoring.md` — pure preservation work.
- `references/test-design.md` — test level, assertions, doubles, fixtures, and maintenance value.
- `references/runners.md` — only when repository-native focused command is unclear.
- `references/failure-modes.md` — passing-first, flaky/unrelated red, missing runner, or constrained verification.
- `references/ui-content.md` — UI, copy, accessibility, legal/safety, localization, and output contracts.
- `references/examples.md` — only when user asks or ecosystem pattern remains unfamiliar.
