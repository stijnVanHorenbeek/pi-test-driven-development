# Evaluations

These files preregister routing and workflow evaluation before initial skill implementation. Matrix amendments 4–8 record migration to skill-only runtime, hardened built-in tool evidence, transparent Codex thinking-level tuning, and independent-review fixes.

- `v1-matrix.json`: models, repetitions, isolation, and gates.
- `cases.json`: natural tasks, routing labels, policy modes, feature-specific red-output patterns, fixture overlays, and postchecks.
- `fixtures/templates.json`: reusable fixture-repository baselines and production/test path signals.
- `run-evals.ts`: Pi SDK runner after implementation.

Runner creates temporary Git repositories by copying a template, applying each case's `base_files`, committing baseline, then applying `working_files` as uncommitted user/incoming work. Case prompts contain no evaluation marker. Automatic cases rely on model routing from skill metadata; explicit cases use `/skill:test-driven-development`.

## Tracks

- **Tuning:** `held_out: false`. May diagnose routing/policy failures while refining prompt.
- **Held-out:** `held_out: true`. Run only after prompt freeze. Cases are preregistered but not secret; results are holdout evidence against iterative prompt fitting, not population-generalization proof.

## Evidence

SDK event capture records successful exact `SKILL.md` reads, built-in tool order, command evidence, model identity, usage/cost when available, final text, final diff, postcheck result, and preserved working-file hashes. Hidden reasoning content is not stored.

A failed, timed-out, missing, stale, or unsupported cell remains visible. Opaque shell mutations cannot establish exact edit order and must be marked unsupported rather than inferred.

Smoke subsets are diagnostic only. Full V1 claim requires every preregistered cell for both models and all three repetitions.

Live model runs cost provider tokens. Review matrix before execution.
