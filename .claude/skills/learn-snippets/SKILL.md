---
name: learn-snippets-conventions
description: Development conventions and patterns for learn-snippets. TypeScript Next.js project with conventional commits.
---

# Learn Snippets Conventions

> Generated from [aaamrh/learn-snippets](https://github.com/aaamrh/learn-snippets) on 2026-03-16

## Overview

This skill teaches Claude the development patterns and conventions used in learn-snippets.

## Tech Stack

- **Primary Language**: TypeScript
- **Framework**: Next.js
- **Architecture**: type-based module organization
- **Test Location**: separate

## When to Use This Skill

Activate this skill when:
- Making changes to this repository
- Adding new features following established patterns
- Writing tests that match project conventions
- Creating commits with proper message format

## Commit Conventions

Follow these commit message conventions based on 7 analyzed commits.

### Commit Style: Conventional Commits

### Prefixes Used

- `feat`
- `fix`

### Message Guidelines

- Average message length: ~16 characters
- Keep first line concise and descriptive
- Use imperative mood ("Add feature" not "Added feature")


*Commit message example*

```text
feat: 编辑器
```

*Commit message example*

```text
fix: 插件的硬编码
```

*Commit message example*

```text
Merge branch 'main' of https://github.com/aaamrh/learn-snippets
```

*Commit message example*

```text
feat: vscode demo
```

*Commit message example*

```text
feat: 更新多租户的代码
```

*Commit message example*

```text
feat: 完善demo
```

*Commit message example*

```text
first commit
```

## Architecture

### Project Structure: Single Package

This project uses **type-based** module organization.

### Source Layout

```
src/
├── app/
├── cache-manager/
├── canvas-annotator/
├── components/
├── config-center/
├── di-container/
├── event-bus/
├── hook-system/
├── hooks/
├── lib/
```

### Configuration Files

- `package.json`
- `tailwind.config.ts`
- `tsconfig.json`

### Guidelines

- Group code by type (components, services, utils)
- Keep related functionality in the same type folder
- Avoid circular dependencies between type folders

## Code Style

### Language: TypeScript

### Naming Conventions

| Element | Convention |
|---------|------------|
| Files | camelCase |
| Functions | camelCase |
| Classes | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |

### Import Style: Path Aliases (@/, ~/)

### Export Style: Default Exports


*Preferred import style*

```typescript
// Use path aliases for imports
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
```

*Preferred export style*

```typescript
// Use default exports for main component/function
export default function UserProfile() { ... }
```

## Error Handling

### Error Handling Style: Try-Catch Blocks


*Standard error handling pattern*

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('User-friendly message')
}
```

## Common Workflows

These workflows were detected from analyzing commit patterns.

### Feature Development

Standard feature implementation workflow

**Frequency**: ~22 times per month

**Steps**:
1. Add feature implementation
2. Add tests for feature
3. Update documentation

**Files typically involved**:
- `src/app/plugin-demo/*`
- `src/plugin-system/*`
- `src/plugin-system/plugins/*`
- `**/*.test.*`
- `**/api/**`

**Example commit sequence**:
```
feat: 优化插件
feat: 完善demo
feat: 更新多租户的代码
```

### Add New Demo Feature

Adds a new demo feature or module, including implementation and demo page.

**Frequency**: ~3 times per month

**Steps**:
1. Create or update implementation files in a new or existing feature directory (e.g., src/cache-manager/CacheManager.ts, src/di-container/Container.ts).
2. Add or update a corresponding demo page under src/app/demos/[feature]/page.tsx.
3. Update src/app/_data/demos.tsx and/or src/app/_data/scenarios.ts to register the new demo.
4. Update src/app/demos/page.tsx or src/app/page.tsx to reflect the new demo.

**Files typically involved**:
- `src/app/demos/*/page.tsx`
- `src/app/_data/demos.tsx`
- `src/app/_data/scenarios.ts`
- `src/app/demos/page.tsx`
- `src/app/page.tsx`
- `src/[feature]/*`

**Example commit sequence**:
```
Create or update implementation files in a new or existing feature directory (e.g., src/cache-manager/CacheManager.ts, src/di-container/Container.ts).
Add or update a corresponding demo page under src/app/demos/[feature]/page.tsx.
Update src/app/_data/demos.tsx and/or src/app/_data/scenarios.ts to register the new demo.
Update src/app/demos/page.tsx or src/app/page.tsx to reflect the new demo.
```

### Add Or Enhance Plugin

Adds a new plugin or enhances the plugin system, including plugin implementation and registration.

**Frequency**: ~2 times per month

**Steps**:
1. Create or update plugin files under src/plugin-system/plugins/ or src/plugin-system/plugins/v2/.
2. Update src/plugin-system/manifest-types.ts or src/plugin-system/types.ts as needed.
3. Update src/plugin-system/PluginHost.ts or related plugin system infrastructure.
4. If applicable, update or add demo pages under src/app/demos/plugin-host/ or src/app/plugin-demo/page.tsx.

**Files typically involved**:
- `src/plugin-system/plugins/*.ts`
- `src/plugin-system/plugins/v2/*.ts`
- `src/plugin-system/manifest-types.ts`
- `src/plugin-system/types.ts`
- `src/plugin-system/PluginHost.ts`
- `src/app/demos/plugin-host/*`
- `src/app/plugin-demo/page.tsx`

**Example commit sequence**:
```
Create or update plugin files under src/plugin-system/plugins/ or src/plugin-system/plugins/v2/.
Update src/plugin-system/manifest-types.ts or src/plugin-system/types.ts as needed.
Update src/plugin-system/PluginHost.ts or related plugin system infrastructure.
If applicable, update or add demo pages under src/app/demos/plugin-host/ or src/app/plugin-demo/page.tsx.
```

### Develop Canvas Annotator Feature

Implements or extends the canvas annotator feature, including tools, components, and demo page.

**Frequency**: ~2 times per month

**Steps**:
1. Create or update files in src/canvas-annotator/tools/ for new tools.
2. Update or add components in src/canvas-annotator/components/.
3. Update core logic in src/canvas-annotator/actions/, src/canvas-annotator/elements/, or src/canvas-annotator/scene/.
4. Update types in src/canvas-annotator/types.ts.
5. Update or add demo page in src/app/demos/canvas-annotator/page.tsx.

**Files typically involved**:
- `src/canvas-annotator/tools/*.ts`
- `src/canvas-annotator/components/*.tsx`
- `src/canvas-annotator/actions/*.ts`
- `src/canvas-annotator/elements/*.ts`
- `src/canvas-annotator/scene/*.ts`
- `src/canvas-annotator/types.ts`
- `src/app/demos/canvas-annotator/page.tsx`

**Example commit sequence**:
```
Create or update files in src/canvas-annotator/tools/ for new tools.
Update or add components in src/canvas-annotator/components/.
Update core logic in src/canvas-annotator/actions/, src/canvas-annotator/elements/, or src/canvas-annotator/scene/.
Update types in src/canvas-annotator/types.ts.
Update or add demo page in src/app/demos/canvas-annotator/page.tsx.
```


## Best Practices

Based on analysis of the codebase, follow these practices:

### Do

- Use conventional commit format (feat:, fix:, etc.)
- Use camelCase for file names
- Prefer default exports

### Don't

- Don't use long relative imports (use aliases)
- Don't write vague commit messages
- Don't deviate from established patterns without discussion

---

*This skill was auto-generated by [ECC Tools](https://ecc.tools). Review and customize as needed for your team.*
