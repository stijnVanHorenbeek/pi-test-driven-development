# Compact ecosystem examples

Load only when user asks or repository pattern remains unfamiliar after inspection.

## Behavior feature

```text
Contract: blank email returns Email required.
RED: focused public submit-form test fails with missing error.
GREEN: smallest validation change passes focused test.
VERIFY: nearby form suite.
Label: tdd-attested.
```

Commands vary:

```bash
pytest tests/test_form.py -k rejects_blank_email
go test ./internal/forms -run '^TestRejectsBlankEmail$'
cargo test rejects_blank_email
pnpm vitest run test/form.test.ts -t 'rejects blank email'
```

## Existing patch

```text
Incoming retry implementation already exists.
Add behavior regression coverage if gap is meaningful.
Run focused and nearby checks.
Label: regression-verified, never tdd-attested.
```

## Pure refactor

```text
Run green baseline.
Refactor loop to iterator without behavior change.
Rerun focused and broader checks.
Label: preservation-verified.
```

## Ordinary copy

```text
Change Save draft to Save.
Inspect render/diff; run existing check.
No new permanent test.
Label: validation-only.
```

## Contractual copy

```text
Accessibility name must be Save changes.
Update role/name behavior test first, observe valid red, then copy.
Label: tdd-attested.
```

Use repository-native syntax and conventions. These examples do not authorize installing a runner.
