# Active TDD workflow

Load for new or changed observable behavior and reproducible bugs when a permanent automated test is worthwhile and feasible.

## 1. Define behavior list

Write a short list of desired behavior variants and important existing behavior that must remain. Keep implementation design out until needed. Order work so each next check creates useful design pressure.

## 2. Choose smallest sufficient level

Use lowest level that proves real contract:

- Unit: pure policy, parsing, calculations, validation.
- Integration: framework wiring, database, HTTP, filesystem, serialization.
- End-to-end: only when contract genuinely requires full user/system path.

Narrowest does not mean mockiest. Prefer real cheap collaborators and public behavior.

## 3. RED

Write or update focused desired-behavior test. Expectations must be independently derived and discriminating.

Before run, state expected failure reason using shortest stable behavior description, not a guessed full framework sentence. Run exact focused command with built-in `bash`. Valid red requires:

- Intended test ran.
- Exit is failing.
- Output matches missing or broken behavior.
- Failure is not syntax, setup, harness, flaky, or unrelated noise.

Passing-first means stop. Behavior may exist, assertion may be weak, or test may not run. Do not edit production until diagnosis.

## 4. GREEN

Make smallest coherent production change that satisfies contract. “Smallest” does not require hard-coded cheating or fragmented code. Avoid unrelated cleanup and speculative generalization.

Rerun focused command. Then run nearby relevant checks based on blast radius.

## 5. REFACTOR

Improve names, duplication, and structure only while green. Do not mix new behavior into cleanup. Rerun relevant checks after each meaningful step.

## 6. Complete truthfully

Use `tdd-attested` only with observed valid red before production mutation and observed green after it. Record command, expected and actual red reason, green result, broader checks, pre-existing failures, and residual risk.

Use built-in `read` and read-only `bash` to inspect repository-native commands. Preserve exact command output needed to report strongest supported evidence label truthfully.

## Test list, not test quota

One list item may use a coherent table-driven test or multiple related assertions. Split unrelated contracts; do not split mechanically by assertion count.

---

Adapted from `obra/superpowers@44c9b2d6e889982ac18c27d05a19fefe335194e1`, `skills/test-driven-development/SKILL.md` (MIT, Jesse Vincent), with risk and safety boundaries substantially revised.
