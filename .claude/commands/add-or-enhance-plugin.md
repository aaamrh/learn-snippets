---
name: add-or-enhance-plugin
description: Workflow command scaffold for add-or-enhance-plugin in learn-snippets.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-enhance-plugin

Use this workflow when working on **add-or-enhance-plugin** in `learn-snippets`.

## Goal

Adds a new plugin or enhances the plugin system, including plugin implementation and registration.

## Common Files

- `src/plugin-system/plugins/*.ts`
- `src/plugin-system/plugins/v2/*.ts`
- `src/plugin-system/manifest-types.ts`
- `src/plugin-system/types.ts`
- `src/plugin-system/PluginHost.ts`
- `src/app/demos/plugin-host/*`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update plugin files under src/plugin-system/plugins/ or src/plugin-system/plugins/v2/.
- Update src/plugin-system/manifest-types.ts or src/plugin-system/types.ts as needed.
- Update src/plugin-system/PluginHost.ts or related plugin system infrastructure.
- If applicable, update or add demo pages under src/app/demos/plugin-host/ or src/app/plugin-demo/page.tsx.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.