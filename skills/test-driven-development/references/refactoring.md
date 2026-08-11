# Refactoring with preservation evidence

Pure refactoring changes internal structure while preserving observable behavior. It starts green.

## Workflow

1. Identify behavior and public boundaries that must remain.
2. Run narrow relevant baseline; record pre-existing failures separately.
3. Assess uncovered risk. Add green characterization only when meaningful risk justifies maintenance.
4. Make small structural change.
5. Rerun focused preservation checks.
6. Run broader checks proportional to blast radius.
7. Repeat while green.

No artificial red. If desired behavior changes, separate that delta and use active TDD where valuable and feasible.

## Coverage decisions

Existing behavior coverage may already be enough. Avoid duplicate tests that repeat same contract at same level. Add characterization when:

- Behavior is important but poorly understood.
- Refactor crosses risky boundary.
- Prior regressions or complex branching make accidental change plausible.
- Current test level cannot observe contract that must remain.

Do not lock private structure merely because it is changing. Tests should survive refactor.

## Evidence

`preservation-verified` requires observed green baseline before mutation and relevant green after mutation. Mention commands, scope, baseline failures, and residual risk.
