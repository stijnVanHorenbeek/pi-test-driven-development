# pi-test-driven-development

This skill-only package defines a risk-based testing policy for [Pi](https://pi.dev). The skill applies TDD to valuable checks of observable behavior, preserves existing and user work, supports pure-refactor baselines, and avoids permanent tests that only prove an edit occurred.

The package registers no custom tools or extension hooks. The agent uses Pi's built-in repository tools directly.

Version 0.1.0 is a release candidate. Full V1 matrix qualification is required before publication to npm `latest`.

## Policy

Tests target observable contracts and plausible regression risks, not changed lines, file types, function counts, or coverage quotas.

Before adding a permanent test:

1. Identify the user, operator, or developer contract.
2. Name the plausible regression that the test would catch.
3. Confirm that the assertion is stable and discriminating.
4. Check whether existing coverage already proves the contract.
5. Compare durable confidence with writing, running, and maintenance costs.

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
- References for workflows, runners, failures, test design, and UI/content.
- TypeScript tests for package and evaluation code.
- An author-attested, preregistered Pi SDK routing and workflow matrix.

The package provides no extension, custom tool, prompt template, theme, global instruction, blocking hook, auto-revert behavior, or coverage quota.

## Built-in tools

The skill guides the agent to use Pi's existing tools:

- `read` and read-only `bash` inspect repository status, docs, manifests, scripts, CI configuration, and existing tests.
- `bash` runs exact focused, baseline, regression, build, lint, typecheck, and broader commands.
- `edit` and `write` make visible source changes while preserving unrelated dirty paths.

The agent evaluates failures directly and reports observed commands, results, residual risk, and a final `Evidence: <label>`. The package adds no model-facing schemas or bookkeeping calls.

## Use

### Automatic activation

When skill discovery is enabled, Pi includes the skill name and description in the system prompt. The model should load the skill when the main task asks it to implement or change observable production behavior, fix a reproducible bug, or refactor production source.

By default, the skill excludes review or explanation only, test-result interpretation, code already written, test-only work, docs or comments only, generated or vendor output, and ordinary copy, style, or formatting edits.

Contractual copy—accessibility names, legal or safety wording, localization, and CLI, API, parser, or error output—can still qualify when stable observable risk changes.

Automatic activation is model-dependent. Use the explicit command when routing must be deterministic.

### Explicit activation

```text
/skill:test-driven-development Implement retry backoff. Choose proportionate mode, preserve existing work, and report observed evidence.
```

Explicit invocation can evaluate cases that are normally excluded. It cannot authorize unsafe operations or false evidence.

## Install

Review the package contents before installation. The package ships Markdown skill resources and no executable extension.

After release, install from npm:

```bash
pi install npm:pi-test-driven-development@0.1.0
```

After tag publication, install from the pinned GitHub release:

```bash
pi install git:github.com/stijnVanHorenbeek/pi-test-driven-development@v0.1.0
```

For local development, install globally from an absolute path:

```bash
pi install /absolute/path/to/test-driven-development
```

Add `-l` for project-local settings. To run temporarily without changing settings:

```bash
pi -e /absolute/path/to/test-driven-development
```

Inspect installed packages:

```bash
pi list
```

## Disable and remove

To disable discovered skills for one run:

```bash
pi --no-skills
```

Explicit `--skill` paths still load with `--no-skills`.

Open Pi resource configuration:

```bash
pi config
pi config -l
```

Package filters can disable the skill resource:

```json
{
  "packages": [
    {
      "source": "/absolute/path/to/test-driven-development",
      "skills": []
    }
  ]
}
```

Remove a global local-path installation:

```bash
pi remove /absolute/path/to/test-driven-development
```

Remove a project-local installation:

```bash
pi remove /absolute/path/to/test-driven-development -l
```

## Development

Development requires Node.js `>=22.19.0`, npm, and Git.

`tsx` runs tests and evaluations. `tsc` performs static checks on evaluation and test code.

```bash
npm install --ignore-scripts
npm run typecheck
npm test
npm run check
npm pack --dry-run --json
```

## Evaluations

The author attests that evaluation inputs were written before the initial skill implementation. The repository had no commits, so the original chronology is not independently verifiable. Matrix amendments 4–8 record the migration to a skill-only runtime, hardened built-in tool evidence, transparent Codex thinking-level tuning, and independent-review fixes. The harness hashes current inputs and code for every run. Future preregistration should use immutable commit history.

- `evals/v1-matrix.json`
- `evals/cases.json`
- `evals/fixtures/templates.json`

The matrix includes two model configurations, three repetitions, 35 natural fixture-repository tasks, automatic positive and negative routing, explicit invocation, workflow safety, anti-patterns, and held-out cases.

Report preregistration and current results without model calls:

```bash
npm run eval:report
```

Review provider cost before running the matrix:

```bash
npm run eval -- --track tuning
npm run eval -- --track held-out
```

The evaluation harness uses Pi SDK sessions, in-memory settings and sessions, package-only skill resources, isolated auth and model paths, event-derived exact skill reads, and built-in tool chronology. Separate CLI/RPC smoke tests check real package discovery and command provenance.

### Evidence status

No full V1 matrix result is committed, so the package makes no release-quality claim about routing or workflow reliability. Development smoke subsets are diagnostic only.

Static and package tests must be reported separately from live matrix results. Structural tests cannot prove probabilistic skill routing. A full claim requires all preregistered cells. Failed, timed-out, stale, missing, or unsupported cells remain visible.

Held-out cases are preregistered but not secret. They test resistance to iterative prompt fitting but do not establish population generalization.

Built-in tool events cannot reconstruct every shell mutation. The evaluation marks ordering as unsupported instead of inferring it. Model evidence labels do not prove semantic correctness for arbitrary repositories.

## Package layout

```text
docs/                                      Acceptance contract and provenance
skills/test-driven-development/SKILL.md    Lean Pi router
skills/test-driven-development/references/ Progressive workflow guidance
evals/                                     Preregistered TypeScript SDK evaluation
tests/                                     Deterministic TypeScript tests
```

## Provenance

The package is a derivative adaptation of [`obra/superpowers`](https://github.com/obra/superpowers), especially:

- `skills/test-driven-development/SKILL.md`
- `skills/test-driven-development/writing-good-tests.md`
- `LICENSE`

Upstream is MIT licensed, copyright (c) 2025 Jesse Vincent. This adaptation retains valid-red and behavior-test guidance. It rejects universal test-per-change mandates and delete/restart handling of existing work.

The local skill currently installed had no recorded Git provenance but shows strong upstream lineage. See [`docs/v1-acceptance-contract.md`](docs/v1-acceptance-contract.md) for the bounded inventory, rejected material, research basis, and acceptance gates.

This package is not affiliated with or endorsed by the upstream project or cited testing authors.

## License

MIT. See [`LICENSE`](LICENSE).
