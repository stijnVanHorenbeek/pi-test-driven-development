# pi-test-driven-development

Risk-based test policy for [Pi](https://pi.dev): skill plus dynamically activated advisory tools. Package uses TDD for valuable observable-behavior checks, preserves existing/user work, supports pure-refactor baselines, and avoids permanent tests that only prove an edit occurred.

> [!WARNING]
> Package extension can run repository commands through `test_run`, with same system access and risk as Pi's bash tool. Review source before installation. Tools are advisory and cannot prove semantic test quality, expected failure meaning, or complete filesystem chronology.

Version 0.1.0 is release-candidate software. Full V1 matrix qualification is required before npm `latest` publication.

## Policy

Tests follow observable contract and plausible regression risk—not changed lines, file types, function counts, or coverage quotas.

Before adding permanent test:

1. Identify user/operator/developer contract.
2. Name plausible regression test catches.
3. Confirm assertion is stable and discriminating.
4. Check whether existing coverage already proves contract.
5. Compare durable confidence with write/run/maintenance cost.

| Situation | Mode | Evidence label |
|---|---|---|
| New/changed observable behavior or reproducible bug | TDD | `tdd-attested` |
| Code or incoming patch already exists | Regression verification | `regression-verified` |
| Pure internal refactor | Preservation | `preservation-verified` |
| No worthwhile permanent test | Validation-only | `validation-only` |
| Safe/reliable automation unavailable | Verification-limited | `verification-limited` |

Never revert, delete, overwrite, hide, or set aside pre-existing/user work solely to recreate red-first history. Never claim unobserved evidence.

## What package provides

- One progressively loaded `test-driven-development` skill.
- One TypeScript extension entrypoint.
- Four tools activated only after package skill loads:
  - `test_context`
  - `test_policy`
  - `test_run`
  - `test_status`
- TypeScript package/evaluation tests.
- Preregistered Pi SDK routing/workflow matrix.

No prompt template, theme, output style, global instruction, blocking edit hook, auto-revert behavior, or coverage quota.

## Advisory tools

### `test_context`

Read-only bounded repository scan. Reports:

- Git dirty paths and workspace roots.
- Existing manifests, lockfiles, test configs, and test roots.
- Sourced test/build/lint/typecheck/check command candidates.
- Unknown, missing, polyglot, or ambiguous setup.

Initial recognizers cover JavaScript/TypeScript, Python, Go, Rust, Ruby, Gradle, Maven, .NET, Elixir, PHP, Swift, Dart/Flutter, Bazel, CMake/CTest, Make, Just, and Task. Repository evidence wins. Tool never installs framework or dependency.

### `test_policy`

Maps explicit task facts to recommended mode, evidence label, permanent-test decision, next proof, and residual risk. Deterministic result is only as sound as supplied facts; tool cannot decide product value from schema fields alone.

### `test_run`

Runs exact selected repository command under phase:

- `baseline`
- `red`
- `green`
- `regression`
- `broader`
- `validation`

Records exit status, duration, bounded output, and predeclared red reason. Exact stable-literal matching identifies a red candidate; agent must still inspect semantic cause. Passing red or unrelated/setup failure is invalid. Tool does not choose commands or install runners.

### `test_status`

Reports strongest label supported by observed ledger. `tdd-attested` needs valid red, visible production mutation after red, and focused green after mutation. Opaque shell edits force downgrade rather than guess.

Ledger persists in tool-result details for session branching. Package writes no global/project bookkeeping file.

## Dynamic activation

Extension defers advisory tool registration and activation until:

- Successful exact read of package `skills/test-driven-development/SKILL.md`; or
- `/skill:test-driven-development` resolving to package skill provenance.

Activation registers tools once and adds them without disabling ambient built-in or third-party tools. Unrelated tasks receive no advisory tool schemas.

## Use

### Automatic activation

Pi always sees skill name and description. Model should load skill when main task asks to implement/change observable production behavior, fix reproducible bug, or refactor production source.

Default exclusions include review/explanation only, test-result interpretation, code already written, test-only work, docs/comments only, generated/vendor output, and ordinary copy/style/format-only edits.

Contractual copy—accessibility names, legal/safety wording, localization, CLI/API/parser/error output—can still qualify when stable observable risk changes.

Automatic activation is model-dependent. Use explicit command when routing must be deterministic.

### Explicit activation

```text
/skill:test-driven-development Implement retry backoff. Choose proportionate mode, preserve existing work, and report observed evidence.
```

Explicit invocation can evaluate normally excluded cases. It cannot authorize unsafe operations or false evidence.

## Install

Pi packages execute trusted TypeScript with full user permissions. Review package first.

From npm after release:

```bash
pi install npm:pi-test-driven-development@0.1.0
```

From pinned GitHub release:

```bash
pi install git:github.com/stijnVanHorenbeek/pi-test-driven-development@v0.1.0
```

Global local-path development install:

```bash
pi install /absolute/path/to/test-driven-development
```

Add `-l` for project-local settings. Temporary run without settings change:

```bash
pi -e /absolute/path/to/test-driven-development
```

Inspect installed packages:

```bash
pi list
```

## Disable and remove

Disable discovered skills for one run:

```bash
pi --no-skills
```

Explicit `--skill` paths still load with `--no-skills`.

Use Pi resource configuration:

```bash
pi config
pi config -l
```

Package filters can disable extension while retaining skill:

```json
{
  "packages": [
    {
      "source": "/absolute/path/to/test-driven-development",
      "extensions": []
    }
  ]
}
```

Without extension, skill still works but advisory tools do not appear. Disable skill independently with `skills: []` when only extension discovery testing is needed.

Remove global local-path install:

```bash
pi remove /absolute/path/to/test-driven-development
```

Remove project-local install:

```bash
pi remove /absolute/path/to/test-driven-development -l
```

## Development

Requires Node.js `>=22.19.0`, npm, and Git.

Pi loads shipped extension TypeScript through documented jiti runtime. Development does not rely on Node native TypeScript stripping; `tsx` runs tests/evals and `tsc` performs static checking.

```bash
npm install --ignore-scripts
npm run typecheck
npm test
npm run check
npm pack --dry-run --json
```

Runtime Pi packages are peer dependencies and are not bundled.

## Evaluations

Author attests evaluation inputs were written before skill/extension prompt implementation. Repository had no commits, so original chronology is not independently verifiable. Harness hashes current inputs and code for every run; future preregistration should use immutable commit history.

- `evals/v1-matrix.json`
- `evals/cases.json`
- `evals/fixtures/templates.json`

Matrix includes two model configurations, three repetitions, 35 natural fixture-repo tasks, automatic positive/negative routing, explicit invocation, workflow safety, anti-patterns, and held-out cases.

Report preregistration/current results without model calls:

```bash
npm run eval:report
```

Run matrix after reviewing provider cost:

```bash
npm run eval -- --track tuning
npm run eval -- --track held-out
```

Evaluation harness uses Pi SDK sessions, in-memory settings/sessions, package-only resources, isolated auth/model paths, and event-derived exact skill reads. Separate CLI/RPC smoke checks real package discovery and command provenance.

### Evidence status

No full V1 matrix result is committed; package makes no release-quality routing or workflow-reliability claim. Development smoke subsets are diagnostic only.

Static/package tests and live matrix results must be reported separately. Structural tests cannot prove probabilistic skill routing. Full claim requires all preregistered cells; failed, timed-out, stale, missing, or unsupported cells remain visible.

Held-out cases are preregistered but not secret. They test against iterative prompt fitting; they do not establish population generalization.

Tool events cannot reconstruct every shell mutation. Evaluation marks unsupported ordering rather than inferring it. Model outputs and tool labels do not prove semantic correctness for arbitrary repositories.

## Package layout

```text
docs/                                      Acceptance contract and provenance
extensions/test-advisor.ts                 Dynamic Pi extension entrypoint
extensions/lib/                            Polyglot context, policy, command, evidence logic
skills/test-driven-development/SKILL.md    Lean Pi router
skills/test-driven-development/references/ Progressive workflow guidance
evals/                                     Preregistered TypeScript SDK evaluation
 tests/                                    Deterministic TypeScript tests
```

## Provenance

Package is derivative adaptation of [`obra/superpowers`](https://github.com/obra/superpowers) at commit [`44c9b2d6e889982ac18c27d05a19fefe335194e1`](https://github.com/obra/superpowers/commit/44c9b2d6e889982ac18c27d05a19fefe335194e1), especially:

- `skills/test-driven-development/SKILL.md`
- `skills/test-driven-development/writing-good-tests.md`
- `LICENSE`

Upstream is MIT licensed, copyright (c) 2025 Jesse Vincent. This adaptation retains valid-red and behavior-test guidance while rejecting universal test-per-change mandates and delete/restart handling of existing work.

Current installed local skill had no recorded Git provenance but shows strong upstream lineage. See [`docs/v1-acceptance-contract.md`](docs/v1-acceptance-contract.md) for bounded inventory, rejected material, research basis, and acceptance gates.

No affiliation or endorsement by upstream project or cited testing authors.

## License

MIT. See [`LICENSE`](LICENSE).
