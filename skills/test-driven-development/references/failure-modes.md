# Failure modes and constrained verification

## Passing-first

Do not call passing test red. Check:

- Behavior already exists.
- Assertion is weak or tautological.
- Wrong case was selected.
- Test did not run.
- Setup bypassed real boundary.

If behavior exists, useful coverage is regression verification. If assertion is weak, make it discriminating before production edits.

## Wrong red

Syntax error, import/setup failure, broken fixture, missing dependency, unrelated suite failure, timeout, or flaky test is not behavior-specific red. Repair harness or isolate focused case. State pre-existing failures separately.

## Flaky red

Rerun and identify nondeterministic boundary. Do not count accidental failure. Control time, randomness, network, process, or shared state when safe. If reliable signal cannot be established, use `verification-limited` and state residual risk.

## Unrelated baseline failure

Use focused command that isolates changed contract. Do not silently fix or suppress unrelated failure. Record exact broader failure after focused green.

## No runner or unavailable dependency

Do not add framework automatically. Inspect repository docs and `test_context` candidates. Use strongest safe alternative: typecheck, build, lint, parser/schema validation, direct pure-function probe, rendered inspection, manual user flow, or dry run.

## Unsafe or expensive environment

Never trigger real charges, production mutations, destructive migrations, external emails, or credentials merely for red/green ritual. Test lower safe boundary if it proves contract. Otherwise use verification-limited evidence and name missing integration confidence.

## Opaque mutations

Shell scripts can mutate files outside visible edit/write events. `test_status` must downgrade sequence claims when order cannot be established. Do not infer TDD from final diff.

## Reporting

Include attempted commands, failure class, alternate validation, pre-existing failures, and residual risk. Verification gap remains a gap even when implementation looks correct.
