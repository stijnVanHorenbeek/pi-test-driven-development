---
name: test-driven-development
description: >-
  Auto-use before production edits when the task changes observable production behavior, fixes a reproducible
  bug, or preserves behavior during a refactor. Route work to TDD, regression verification,
  preservation, or proportionate validation. Auto-use excludes review/explanation, test-result
  interpretation, test-only work, docs/comments, generated/vendor output, ordinary copy/style/format
  changes, and tasks whose requested production change is already complete. Contractual copy,
  runtime config, schemas, migrations, and build behavior still qualify when observable risk changes.
  Explicit invocation may evaluate excluded cases. Preserve pre-existing/user work and report only
  observed evidence.
license: MIT
---

# Risk-based test-driven development

## Goal

Tests target observable contracts and plausible regression risk—not changed lines, file types,
function counts, or coverage quotas. Use TDD when a valuable check can drive behavior; otherwise
use preservation, regression verification, or proportionate validation.

## Safety boundary

Inspect repository state first. Never revert, delete, overwrite, hide, or set aside pre-existing or
user work to recreate test-first history. Preserve incoming patches and dirty-tree changes. Never
claim unobserved results. Repository and user constraints outrank this workflow.

## Test-value gate

Before adding a permanent test, answer:

1. Which user, operator, or developer contract changes or needs protection?
2. Which plausible regression would test catch?
3. Is assertion stable and discriminating—wrong behavior fails, not merely old text disappears?
4. Does existing coverage already prove contract?
5. Does durable confidence justify write, run, and maintenance cost?

Do not mirror internal manifest/config values, assert internal repository paths, or turn build, pack,
or dry-run output into tests unless a named external consumer depends on that exact artifact.
Otherwise validate directly.

If no worthwhile permanent test remains, choose proportionate existing, static, rendered, manual,
or live validation. Do not add a framework or snapshot merely to prove an edit occurred.

## Select mode

Route per requested contract, not per file. A fix or feature in existing code still uses TDD when
valuable and feasible; regression verification covers already-implemented requested behavior.

| Situation | Mode | Evidence label |
|---|---|---|
| New/changed observable behavior or reproducible bug; useful automation feasible | TDD | `tdd-attested` |
| Requested behavior already implemented before this run | Regression verification | `regression-verified` |
| Pure refactor/internal restructuring | Preservation | `preservation-verified` |
| No worthwhile new permanent test; proportionate checks complete | Validation-only | `validation-only` |
| Material verification gap remains after safe attempts | Verification-limited | `verification-limited` |

Manual, rendered, static, or existing automated checks can suffice. A missing runner alone does
not limit verification; an unperformed necessary check does.

Routing edges:

- Ordinary static copy/style/format usually needs artifact inspection and proportionate existing checks,
  not a new test.
- Accessibility names, legal/safety text, localization, parser/CLI/API/error output can be stable
  user-facing contracts worth testing.
- Config/schema/migration/dependency/build changes usually need direct validation unless external
  behavior changes.
- Explicit strict-TDD requests can override default no-test routing, never safety or evidence honesty.

A test can contain coherent table cases or multiple related assertions for one contract. “One test
per behavior” guides scope, not assertion count.

## Valid evidence

A valid red means intended test ran and failed for expected missing/broken behavior. Passing-first,
syntax, setup, flaky, or unrelated failure is not red. Diagnose before production edits.

Green means focused behavior check passes, relevant surrounding checks pass, and important failures
are not hidden. For preservation, both baseline and post-change checks stay green. When automation
cannot establish enough confidence, use strongest safe alternative and state residual risk.

## Evidence workflow

Inspect repository state and repository-native commands before choosing scope or runner. Before a red
run, state the expected behavior failure. Run focused and broader evidence commands separately, and
preserve their status instead of masking failures with `|| true` or unrelated shell composition.

Judge failures semantically. Exit status and matching text cannot promote setup, syntax, flaky, or
unrelated failures into valid red evidence. Report exact focused/broader commands and results,
expected/observed red reason when applicable, pre-existing failures, and residual risk.
Final diff cannot prove order; prose cannot replace tool evidence.

End with `Evidence: <label>` for a single scope. For mixed work, use `Evidence: <label> — <scope>`
per independent contract. Labels describe evidence, not a ranking: one successful scope
cannot cover another's gap. Mark each materially unverified scope `verification-limited`.

## Load references narrowly

- `references/workflow.md` — active feature or bug TDD.
- `references/regression-evaluation.md` — existing patches, legacy code, or later coverage.
- `references/refactoring.md` — pure preservation work.
- `references/test-design.md` — test level, assertions, doubles, fixtures, and maintenance value.
- `references/runners.md` — only when repository-native focused command is unclear.
- `references/failure-modes.md` — passing-first, flaky/unrelated red, missing runner, or constrained verification.
- `references/ui-content.md` — UI, copy, accessibility, legal/safety, localization, and output contracts.
- `references/examples.md` — only when user asks or ecosystem pattern remains unfamiliar.
