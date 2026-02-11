# Phase 2 Setup Instructions

After completing Phase 2 configuration, you need to install the new dependencies.

## Install Dependencies

```bash
cd /Users/yhfy2006/Documents/GitHub/vibepilot

# Install all new dev dependencies
pnpm install
```

This will install:

- ESLint + TypeScript ESLint plugins
- Prettier
- husky (Git hooks)
- lint-staged
- Vitest coverage provider
- React/Next.js linting plugins

## Initialize Husky

After installation, husky hooks should be automatically set up via the `prepare` script. If not:

```bash
pnpm prepare
```

## Verify Setup

### 1. Check ESLint

```bash
pnpm lint
```

Expected: May show some linting errors that need fixing.

### 2. Check Prettier

```bash
pnpm format:check
```

Expected: May show formatting issues.

### 3. Run Tests with Coverage

```bash
pnpm test:coverage
```

Expected: Tests run with coverage report.

### 4. Test Pre-commit Hook

```bash
# Make a small change
echo "// test" >> packages/protocol/src/index.ts

# Try to commit
git add packages/protocol/src/index.ts
git commit -m "test: verify pre-commit hook"
```

Expected: lint-staged runs ESLint and Prettier on staged files.

**Note:** Revert the test change after verification:

```bash
git reset HEAD packages/protocol/src/index.ts
git checkout packages/protocol/src/index.ts
```

## Fix Linting Issues (Optional)

If you want to auto-fix linting issues:

```bash
pnpm lint:fix
pnpm format
```

## Coverage Thresholds

The following thresholds are now enforced:

| Package  | Lines | Functions | Branches | Statements |
| -------- | ----- | --------- | -------- | ---------- |
| protocol | 90%   | 90%       | 85%      | 90%        |
| agent    | 75%   | 75%       | 70%      | 75%        |
| web      | 70%   | 70%       | 65%      | 70%        |

If tests fail to meet these thresholds, the build will fail.

## GitHub Actions

The CI workflows are now configured but won't run until you:

1. Push to GitHub
2. Create a pull request

The workflows will automatically:

- Run tests on Node 20.x and 22.x
- Check linting
- Type check (build all packages)
- Generate coverage reports
- Run security audits
- Perform CodeQL analysis (on push to main)

### Optional: Codecov Integration

If you want coverage badges, sign up for [Codecov](https://codecov.io/) and add the token:

```bash
# In your GitHub repository settings:
# Settings > Secrets and variables > Actions > New repository secret
# Name: CODECOV_TOKEN
# Value: <your token from codecov.io>
```

## Troubleshooting

### ESLint Errors

If you see TypeScript project errors:

```bash
# Rebuild all packages first
pnpm build
# Then run lint
pnpm lint
```

### Husky Not Working

If pre-commit hooks don't trigger:

```bash
# Reinstall husky
rm -rf .husky
pnpm prepare
```

### Coverage Threshold Failures

If coverage drops below thresholds:

```bash
# Check which files lack coverage
pnpm test:coverage

# Write more tests for uncovered code
```

## Next Steps

After Phase 2 is complete, you can proceed to Phase 3 (Production Polish) which includes:

- React Error Boundaries
- Dockerfile + docker-compose
- E2E tests
- Structured logging
- Issue/PR templates

---

All Phase 2 files have been created. Run `pnpm install` to complete the setup.
