---
name: add-new-demo-feature
description: Workflow command scaffold for add-new-demo-feature in learn-snippets.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-new-demo-feature

Use this workflow when working on **add-new-demo-feature** in `learn-snippets`.

## Goal

Adds a new demo feature or module, including implementation and demo page.

## Common Files

- `src/app/demos/*/page.tsx`
- `src/app/_data/demos.tsx`
- `src/app/_data/scenarios.ts`
- `src/app/demos/page.tsx`
- `src/app/page.tsx`
- `src/[feature]/*`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update implementation files in a new or existing feature directory (e.g., src/cache-manager/CacheManager.ts, src/di-container/Container.ts).
- Add or update a corresponding demo page under src/app/demos/[feature]/page.tsx.
- Update src/app/_data/demos.tsx and/or src/app/_data/scenarios.ts to register the new demo.
- Update src/app/demos/page.tsx or src/app/page.tsx to reflect the new demo.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.