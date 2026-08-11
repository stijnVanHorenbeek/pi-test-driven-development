# Regression verification and existing work

Use when implementation, incoming patch, spike, generated candidate, or user work already exists before test evidence.

## Preserve tree

Never revert, delete, overwrite, hide, stash, or set aside work solely to manufacture red-first provenance. Inspect status and distinguish task changes from pre-existing changes. Ask only when ownership or safe continuation is unclear.

Tests added after implementation can still be valuable. They are regression verification, not TDD.

## Evaluate value

1. Identify observable contract current implementation claims.
2. Name realistic mutation/regression test should catch.
3. Check existing coverage for same contract.
4. Add focused regression coverage only when confidence justifies maintenance cost.
5. Run focused and relevant broader checks.
6. Report `regression-verified`, not `tdd-attested`.

Passing-first test can indicate implementation already satisfies desired behavior. Confirm test is discriminating and actually ran. If useful, keep as regression coverage. Do not weaken test merely to create red.

## Legacy code

Characterization tests are useful for meaningful uncovered behavior needed during change. They start green. Add only enough to bound real risk. If new behavior is still needed after characterization, drive that delta with valid red when feasible.

## Incoming patch evidence

Record:

- Work present before your changes.
- Coverage added or reused.
- Focused command and result.
- Production files intentionally left untouched.
- Remaining untested behavior.

No final diff can prove test-first history. State chronology honestly.

---

Substantially revises existing-code guidance from `obra/superpowers@44c9b2d6e889982ac18c27d05a19fefe335194e1` to prohibit destruction of pre-existing or user work.
