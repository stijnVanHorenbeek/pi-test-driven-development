# UI and content decision guide

Classify copy by contract, risk, and stability—not “text versus code.”

## Ordinary copy

Button wording, punctuation, static prose, color, spacing, and formatting usually do not justify new permanent tests. Edit, inspect diff/render, and run proportionate existing checks. Do not add framework or whole-component snapshot for tiny edit.

Weak sole assertion:

```js
expect(button).not.toHaveTextContent("Old label")
```

Blank or arbitrary wrong text passes. This proves old text disappeared, not desired state.

## Accessibility contract

Accessible names, roles, states, keyboard behavior, focus, and announcements are observable behavior. Prefer user-facing query:

```js
screen.getByRole("button", { name: "New label" })
```

Use level that resembles assistive use and fits repository setup.

## Legal and safety wording

Exact text can be contractual. Assert required approved wording when stable and important. If old wording itself is forbidden, absence can be meaningful; usually pair absence with positive required-state assertion.

## Localization

Stable keys, placeholders, pluralization, fallback behavior, and message selection can warrant tests. Do not snapshot entire catalog for one copy change. Preserve unrelated translations.

## CLI, API, parser, and errors

Exact output, exit codes, schema fields, serialization, and error strings may be public contracts. Test exactness only where consumers rely on it. Incidental formatting should remain flexible.

## CSS and visual work

Prefer render inspection, existing visual regression, lint/build, or browser evidence based risk. Do not create visual framework for one low-risk color tweak. Layout shift, hidden controls, contrast, and state-dependent styling may justify stronger checks.

## Decision shortcut

Ask whether wrong wording/state can break accessibility, automation, legal/safety obligations, localization, protocol consumers, or explicit acceptance criteria. If not, validation-only is usually enough.
