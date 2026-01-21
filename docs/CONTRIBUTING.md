# Contributing to YART

Thank you for your interest in contributing to YART! This document outlines how to contribute, our coding standards, and testing approach.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- pnpm (recommended) or npm
- Git
- A GitHub account

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/yart.git
   cd yart
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Start the development servers**:
   ```bash
   # Terminal 1: Frontend
   pnpm dev

   # Terminal 2: Worker (if working on backend)
   pnpm wrangler dev
   ```

5. **Run tests** to ensure everything works:
   ```bash
   pnpm test
   pnpm test:e2e
   ```

---

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include steps to reproduce, expected vs actual behaviour
4. Include browser/OS information if relevant

### Suggesting Features

1. Check existing issues and discussions
2. Use the feature request template
3. Explain the use case and why it would benefit users

### Submitting Code

**Never commit directly to main.** Always use feature branches.

1. **Create a feature branch** from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/your-feature-name
   ```

2. **Branch naming convention**:
   - `feat/description` - New features
   - `fix/description` - Bug fixes
   - `refactor/description` - Code refactoring
   - `test/description` - Test additions
   - `docs/description` - Documentation
   - `chore/description` - Build, config, dependencies

3. **Make your changes** following our coding standards

4. **Verify in browser** - Check your changes work as expected

5. **Write or update E2E tests** for your changes

6. **Ensure all tests pass**:
   ```bash
   pnpm test
   pnpm test:e2e
   ```

7. **Commit logical units** (see commit guidelines below)

8. **Push and open a Pull Request**

---

## Coding Standards

### TypeScript

- **Strict mode enabled**: All TypeScript strict checks are on
- **Explicit types**: Prefer explicit types over `any`; use `unknown` when type is truly unknown
- **Type exports**: Export types/interfaces that are used across modules

```typescript
// ✅ Good
interface CardProps {
  id: string;
  content: string;
  author: string;
  onPublish: (id: string) => void;
}

// ❌ Avoid
const Card = (props: any) => { ... }
```

### React

- **Functional components**: Use functional components with hooks
- **Named exports**: Prefer named exports for components
- **Component files**: One component per file, filename matches component name

```typescript
// ✅ Good - Card.tsx
export function Card({ id, content, author }: CardProps) {
  return ( ... );
}

// ❌ Avoid - multiple components, default export
export default function Card() { ... }
function CardHeader() { ... }
```

### File Organisation

- **Co-location**: Keep related files together (component, styles, tests)
- **Index files**: Use sparingly, only for public module APIs
- **Flat where possible**: Avoid deep nesting

```
components/
├── Card/
│   ├── Card.tsx
│   ├── Card.test.tsx
│   └── index.ts          # Re-exports Card
├── Column/
│   ├── Column.tsx
│   └── index.ts
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `CardList.tsx` |
| Hooks | camelCase, `use` prefix | `useRoom.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Types/Interfaces | PascalCase | `RoomState` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_CARDS_PER_COLUMN` |
| CSS classes | kebab-case | `card-container` |

### Code Style

- **Formatting**: Prettier handles formatting (runs on commit)
- **Linting**: ESLint enforces code quality (runs on commit)
- **No console.log**: Remove debug logs before committing (use proper logging if needed)

The project uses pre-commit hooks to automatically format and lint code.

### Comments

- **Self-documenting code**: Prefer clear names over comments
- **Why, not what**: Comment to explain *why*, not *what*
- **JSDoc for public APIs**: Document exported functions and components

```typescript
// ✅ Good - explains why
// Owner key validated server-side to prevent spoofing
const isOwner = await validateOwnerKey(roomId, ownerKey);

// ❌ Avoid - states the obvious
// Check if user is owner
const isOwner = checkOwner();
```

---

## Testing Strategy

### Verify-Then-Test Workflow

**Every code change must be verified and tested before completion.**

Whether working manually or with AI assistance, follow this workflow:

1. **Make the change** - Implement the feature or fix
2. **Visually verify** - Check it works in the browser
   - Navigate to the affected page
   - Interact with the new/changed functionality
   - Confirm it behaves as expected
3. **Write E2E test** - Add Playwright test coverage
   - Test the user-visible behaviour
   - Use accessible selectors
   - Cover both happy path and error states where relevant
4. **Run full test suite** - Ensure nothing is broken

This workflow ensures that:
- Changes work as intended before being committed
- Regressions are caught by automated tests
- Test coverage grows with each change

### Philosophy

**Favour end-to-end tests.** They provide the most confidence that the application works correctly from a user's perspective. Add unit tests only when:

- Testing complex logic that's hard to exercise via E2E
- Testing edge cases that would require many E2E scenarios
- Testing utilities or pure functions in isolation

### End-to-End Tests (Playwright)

E2E tests are the primary testing approach. They should cover:

- All user flows (happy paths)
- Error states and edge cases
- Cross-browser compatibility
- Real-time synchronisation (multiple users)

**Location**: `e2e/` directory

**Running E2E tests**:
```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI mode (for debugging)
pnpm test:e2e --ui

# Run specific test file
pnpm test:e2e e2e/room-creation.spec.ts
```

**E2E Test Guidelines**:

- Test user-visible behaviour, not implementation details
- Use accessible selectors (`getByRole`, `getByLabel`, `getByText`)
- Each test should be independent (no shared state)
- Use descriptive test names that describe the scenario

```typescript
// ✅ Good
test('room owner can add a new column', async ({ page }) => {
  await page.goto('/room/test-room');
  await page.getByRole('button', { name: 'Add Column' }).click();
  await page.getByLabel('Column name').fill('New Ideas');
  await page.getByRole('button', { name: 'Save' }).click();
  
  await expect(page.getByRole('heading', { name: 'New Ideas' })).toBeVisible();
});
```

### Unit Tests (Vitest)

For isolated logic testing when needed.

**Location**: Co-located with source files (`*.test.ts`)

**Running unit tests**:
```bash
# Run all unit tests
pnpm test

# Run in watch mode
pnpm test --watch

# Run with coverage
pnpm test --coverage
```

**When to write unit tests**:

- Complex pure functions (calculations, transformations)
- State reducers or complex state logic
- Utility functions with many edge cases

```typescript
// utils/generateAnonymousName.test.ts
import { generateAnonymousName } from './generateAnonymousName';

describe('generateAnonymousName', () => {
  it('returns a name in "Adjective Animal" format', () => {
    const name = generateAnonymousName();
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('generates unique names for different seeds', () => {
    const name1 = generateAnonymousName('seed1');
    const name2 = generateAnonymousName('seed2');
    expect(name1).not.toBe(name2);
  });
});
```

### Test Coverage Goals

- **E2E**: All user paths must be covered
- **Unit**: No strict coverage target; add tests where they provide value
- **Focus on critical paths**: Room creation, card publishing, voting, real-time sync

---

## Commit Guidelines

### Atomic Commits

**Each commit should be a single, logical unit of work.**

A good commit:
- Does **one thing** that could be reverted independently
- Is **complete** - includes the change AND its tests together
- **Passes all tests** - never breaks the build
- Has a **clear message** explaining what and why

**Good examples:**
```
feat(room): add Column component with drag-drop reordering
fix(vote): prevent duplicate votes from same user
test(e2e): add tests for focus mode navigation
```

**Bad examples:**
```
WIP
fix stuff
add column and also fix bug and update tests
```

### When to Commit

Commit after completing:
- A component + its E2E test
- A bug fix + its regression test
- A refactor (that doesn't change behaviour)
- A set of related type definitions

**Do NOT** batch unrelated changes into one commit.

### Commit Message Format

Use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting (no code change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

**Examples**:
```
feat(room): add card grouping functionality

fix(vote): prevent duplicate votes from same user

docs(readme): update setup instructions

test(e2e): add tests for focus mode navigation
```

---

## Pull Request Process

1. **Fill out the PR template** completely
2. **Link related issues** using keywords (e.g., "Fixes #123")
3. **Ensure CI passes**: All tests must pass
4. **Request review** from maintainers
5. **Respond to feedback** and make requested changes
6. **Squash commits** if requested before merge

### PR Checklist

- [ ] Work is on a feature branch (not main)
- [ ] Commits are atomic and logical units
- [ ] Changes visually verified in browser
- [ ] E2E tests added/updated for changes
- [ ] All tests pass (`pnpm test && pnpm test:e2e`)
- [ ] Documentation updated if needed
- [ ] No console.log or debug code
- [ ] TypeScript compiles without errors
- [ ] Lint and format checks pass

---

## Code of Conduct

Be respectful and inclusive. We're all here to build something useful together.

- Be welcoming to newcomers
- Be patient with questions
- Accept constructive criticism gracefully
- Focus on what's best for the project

---

## Questions?

- Open a Discussion on GitHub for general questions
- Open an Issue for bugs or feature requests
- Tag maintainers in PRs if you need help

Thank you for contributing! 🎉
