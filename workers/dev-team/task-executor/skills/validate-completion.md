# validate-completion

Run back pressure checks on completed work.

## Arguments

`$ARGUMENTS` = `--repo <path>` (required)

Optional:
- `--checks <list>` - Comma-separated checks to run (default: all)
- `--strict` - Fail on warnings

## Process

1. **Run Type Check**
   ```bash
   npm run typecheck
   ```
   - Must pass with zero errors
   - Warnings logged but don't fail

2. **Run Linter**
   ```bash
   npm run lint
   ```
   - Must pass with zero errors
   - Auto-fix if possible

3. **Run Tests**
   ```bash
   npm test
   ```
   - All tests must pass
   - New code should have coverage

4. **Run Build** (if applicable)
   ```bash
   npm run build
   ```
   - Build must succeed
   - No runtime errors

5. **Report Results**
   - Show pass/fail for each check
   - Surface errors clearly
   - Suggest fixes if possible

## Checks

| Check | Command | Required |
|-------|---------|----------|
| typecheck | npm run typecheck | Yes |
| lint | npm run lint | Yes |
| test | npm test | Yes (if tests exist) |
| build | npm run build | No (optional) |

## Output

Validation report:
```
Validation Results:
  ✅ typecheck: passed (0 errors)
  ✅ lint: passed (0 errors, 2 warnings)
  ✅ test: passed (45 tests, 100% passing)
  ⏭️ build: skipped

Overall: PASS
```

Or on failure:
```
Validation Results:
  ✅ typecheck: passed
  ❌ lint: failed (3 errors)
     - src/api/auth.ts:42 - Unexpected any
     - src/api/auth.ts:58 - Missing return type
     - src/api/auth.ts:72 - Unused variable 'temp'
  ⏭️ test: skipped (lint failed)

Overall: FAIL
Suggestion: Fix lint errors, then re-run
```

## Example

```bash
node dist/index.js validate-completion --repo repos/private/my-app

# Output:
# Running validation checks...
#
# [1/3] typecheck...
#   ✅ passed (0 errors)
#
# [2/3] lint...
#   ✅ passed (0 errors, 2 warnings)
#   Warnings:
#     - src/api/auth.ts:42 - Consider using explicit type
#     - src/api/auth.ts:58 - Prefer const over let
#
# [3/3] test...
#   ✅ passed (45 tests)
#
# Overall: PASS
# Ready to commit.
```
