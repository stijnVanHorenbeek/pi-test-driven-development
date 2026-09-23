# pi-test-driven-development

[![npm version](https://img.shields.io/npm/v/pi-test-driven-development.svg)](https://www.npmjs.com/package/pi-test-driven-development)

This skill-only package defines a risk-based testing policy for [Pi](https://pi.dev). The skill applies TDD to valuable checks of observable behavior, preserves existing and user work, supports pure-refactor baselines, and avoids permanent tests that only prove an edit occurred.

The package registers no custom tools or extension hooks. The agent uses Pi's built-in repository tools directly.

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
| Requested behavior already implemented before the run | Regression verification | `regression-verified` |
| Pure internal refactor | Preservation | `preservation-verified` |
| No worthwhile new permanent test; proportionate checks complete | Validation-only | `validation-only` |
| Material verification gap remains after safe attempts | Verification-limited | `verification-limited` |

Route each requested contract, not each file: a bug fix in existing code can still use TDD. Completed
manual, rendered, static, or existing automated checks can justify validation-only; a missing runner
alone does not make verification limited.

Never revert, delete, overwrite, hide, or set aside pre-existing/user work solely to recreate red-first history. Never claim unobserved evidence.

## What package provides

- One progressively loaded `test-driven-development` skill.
- References for workflows, runners, failures, test design, and UI/content.
- TypeScript tests for package and evaluation code.
- A Pi SDK routing and workflow evaluation matrix with content-addressed results.

The package provides no extension, custom tool, prompt template, theme, global instruction, blocking hook, auto-revert behavior, or coverage quota.

## Built-in tools

The skill guides the agent to use Pi's existing tools:

- `read` and read-only `bash` inspect repository status, docs, manifests, scripts, CI configuration, and existing tests.
- `bash` runs exact focused, baseline, regression, build, lint, typecheck, and broader commands.
- `edit` and `write` make visible source changes while preserving unrelated dirty paths.

The agent evaluates failures directly and reports observed commands, results, residual risk, and a
final `Evidence: <label>`. Mixed work uses `Evidence: <label> — <scope>` per independent contract,
with `verification-limited` for materially unverified scopes. One scope's success cannot cover
another's gap. The package adds no model-facing schemas or bookkeeping calls.

## Use

### Automatic activation

When skill discovery is enabled, Pi includes the skill name and description in the system prompt. The model should load the skill when the main task asks it to implement or change observable production behavior, fix a reproducible bug, or refactor production source.

By default, the skill excludes review or explanation, test-result interpretation, test-only work, docs or comments, generated or vendor output, ordinary copy, style, or formatting edits, and tasks whose requested production change is already complete.

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
pi install npm:pi-test-driven-development
```

After tag publication, install from a pinned GitHub release (replace `vX.Y.Z` with the latest release):

```bash
pi install git:github.com/stijnVanHorenbeek/pi-test-driven-development@vX.Y.Z
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

The [evaluation guide](evals/README.md) explains how to run the matrix and read its reports. Diagnostic subsets and deterministic checks do not establish reliability; trace-informed grader changes and the lack of an independent holdout leave overfitting risk.

```bash
npm run check
npm run eval -- --case reproducible-bug --repetitions 1
npm run eval --
```

Scoring is deterministic by default. Add `--judge jev` for TypeSafe classification of recorded traces; chronology, artifacts, and safety remain code-owned.

## Package layout

```text
skills/test-driven-development/SKILL.md    Lean Pi router
skills/test-driven-development/references/ Progressive workflow guidance
evals/                                     TypeScript SDK evaluation and fixtures
tests/                                     Deterministic TypeScript tests
```

## Provenance

The package is a derivative adaptation of [`obra/superpowers`](https://github.com/obra/superpowers), especially:

- `skills/test-driven-development/SKILL.md`
- `skills/test-driven-development/writing-good-tests.md`
- `LICENSE`

Upstream is MIT licensed, copyright (c) 2025 Jesse Vincent. This adaptation retains valid-red and behavior-test guidance. It rejects universal test-per-change mandates and delete/restart handling of existing work.

This package is not affiliated with or endorsed by the upstream project or cited testing authors.

## License

MIT. See [`LICENSE`](LICENSE).
