# Evaluation suite

`matrix.json` sets models, repetitions, and acceptance rules; `cases.json` defines tasks and expected outcomes; `fixtures/templates.json` defines temporary repositories. The report, not this document, gives the current run status. The grader has changed after trace review; there is no independent holdout.

## Run

Requires Node.js ≥22.19, npm, Git, and configured Pi model access. The .NET fixtures also require the SDK targeted by their projects and restore of their test packages; keep SDK setup local.

```bash
npm run check
npm run eval -- --case reproducible-bug --repetitions 1
npm run eval --
```

`npm run check` uses no models. Live evals consume provider tokens. A case, model, reasoning override, reduced repetitions, `--max-cells`, or no-skill baseline is a **diagnostic**, never full-matrix qualification. Plain `npm run eval --` selects all cases with the matrix defaults; recorded matching cells are reused.

Useful options:

- `--case ID`, `--model provider/model`, `--thinking LEVEL`: select a diagnostic subset (each may be repeated).
- `--arm both`: compare the skill to a no-skill baseline on automatic tasks. Baselines do not establish TDD workflow.
- `--retry-failed`: append attempts for execution failures, not completed but incorrect outcomes.
- `--judge jev`: opt in to semantic classification of matrix traces (details below).

## Jev is opt-in

Default scoring uses deterministic trace rules. With `--judge jev`, TypeSafe classifies bounded semantic questions from each recorded cell; its answers **can change workflow scoring and qualification**. Code still checks claim presence, tool chronology, test execution, artifacts, and protected user work. Jev cannot turn a missing test run or destroyed user file into a pass.

```bash
cp -n .env.example .env
chmod 600 .env
# Set TYPESAFE_API_KEY locally in .env; never commit it.
npm run eval -- --judge jev --case reproducible-bug --repetitions 1
```

The same flag works with `npm run eval:report -- --judge jev ...`. Report-only starts **no Pi agent sessions**, but may call TypeSafe for uncached questions. Without a key or matching cache, invalid/uncertain answers, or on service failure, affected evidence remains unsupported. Jev requests and answers are cached; original Pi attempts are never rewritten. Its confidence guard is uncalibrated. The retained `jev/pilot.json` contains assistant-reviewed examples, including a high-confidence false attribution; it is not independent accuracy evidence.

Only send reviewed fixture traces. Bounded redaction is not a general secret scrubber. [TypeSafe API](https://docs.typesafe.ai/api.md) · [Choice questions](https://docs.typesafe.ai/primitives/choice.md).

## Read a result

```bash
npm run eval:report -- --case reproducible-bug --repetitions 1
npm run eval:report --
```

Reports separate **execution complete**, **selected cells passed**, and **full matrix qualified**. Passing an artifact postcheck does not prove the claimed workflow; `unsupported` means the recorded evidence is insufficient, not necessarily that the code is wrong. `matrix.json` defines the qualification thresholds. Missing/unsupported evidence or destruction of protected user work blocks qualification.

The grader requires a behavior-specific failing test before production edits and a proven passing rerun afterward. For .NET, a successful `dotnet test` exit with zero executed tests is **not** green. Evaluator-owned postchecks verify artifacts independently of model-editable tests. Compound shell commands and opaque mutations may leave valid work unsupported.

The latest report is `evals/results/v2/report.{json,md}`. Raw attempts and past selection reports remain under `evals/results/v2/<content-key>/`; changing evaluated inputs creates a new key rather than silently reusing old results. Results are gitignored; historical `results/v1/` and Jev pilot reports remain untouched. Provider-reported dollar costs are estimates, not subscription charges.

Pi resources and fixtures are isolated, **not OS-sandboxed**. Pi still has host shell/filesystem and provider access; use trusted fixtures or a disposable environment. The original evaluation chronology was author-attested, not independently preregistered. For a future independent qualification claim, freeze inputs and obtain genuinely new cases after tuning.
