# Test design and maintenance value

A permanent test earns its place by catching named plausible regression. Ask: what production change makes this fail, and is that change a bug rather than merely different implementation?

## Discriminating assertions

- Assert desired observable result, side effect, state, response, event, or user-facing contract.
- Derive expected values independently; do not reuse code under test or its helper.
- Prefer positive required state. Use absence when absence itself is contractual.
- Blank, default, or arbitrary wrong behavior should not satisfy assertion.
- Existing coverage may already prove contract; avoid duplicate coverage.

## Coherent scope

One test can contain table-driven cases or multiple related assertions for one contract. Split unrelated outcomes, not every assertion. Setup and failure should remain understandable.

## Public behavior

Prefer public APIs and user-visible behavior over private methods, helper calls, internal order, exact implementation, or source-text grep. Tests should stay green during pure refactor.

## Configuration and repository layout

Build, pack, and dry-run output can validate internal packaging or configuration changes without becoming permanent tests. Do not add tests that mirror internal manifest or config values, assert internal file presence or absence, grow repository-path blacklists, or fail on intentional layout changes.

An exception needs a named external consumer that depends on the exact artifact. Test that consumer-facing contract, not the configuration text that produces it.

## Level

Choose smallest sufficient level, not smallest possible level:

- Unit for pure deterministic behavior.
- Integration when framework, persistence, process, or protocol wiring is contract.
- End-to-end only when lower levels cannot prove user path.

Use repository's current mix. Do not add framework for tiny edit.

## Doubles and fixtures

Use real collaborators when cheap and deterministic. Double slow, external, nondeterministic, expensive, or dangerous boundary. Assert component behavior, not mock existence. Mirror required real data shape. Keep test-only cleanup outside production APIs.

Fixtures should expose important inputs. Shared mutable state, uncontrolled time/randomness/network, and oversized setup reduce trust.

## Common weak tests

- Old-symbol/text absence as sole proof of desired state.
- Whole-component snapshot for tiny rule.
- Exact private-call choreography.
- Test computed expectation with same logic as implementation.
- Framework's own behavior rather than repository boundary.
- Coverage-only execution with no meaningful assertion.
- Manifest/config mirrors and repository-layout presence or absence checks without a stable external contract.

Use mutation thought experiment: wrong branch, value, side effect, empty result, or boundary input should fail at least one relevant test.

---

Adapted from `obra/superpowers@44c9b2d6e889982ac18c27d05a19fefe335194e1`, `skills/test-driven-development/writing-good-tests.md` (MIT, Jesse Vincent).
