# review-pr

Review a pull request for code quality, correctness, and best practices.

## Arguments

`$ARGUMENTS` = `--pr <number>` (required)

Optional:
- `--repo <path>` - Target repository
- `--focus <area>` - Focus area: security|performance|style|all
- `--strict` - Enable strict review mode

## Process

1. Fetch PR details via `gh pr view`
2. Get diff via `gh pr diff`
3. Analyze changes:
   - Code correctness
   - Security vulnerabilities
   - Performance implications
   - Style consistency
   - Test coverage
4. Check against project standards:
   - CONTRIBUTING.md
   - Existing patterns in codebase
5. Generate review comments
6. Present findings to human for approval
7. Submit review via `gh pr review`

## Review Checklist

### Code Quality
- [ ] Logic is correct and handles edge cases
- [ ] No obvious bugs or regressions
- [ ] Code is readable and maintainable
- [ ] Functions/methods are appropriately sized

### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No SQL injection / XSS vulnerabilities
- [ ] Auth/authz properly implemented

### Performance
- [ ] No N+1 queries
- [ ] Appropriate caching
- [ ] No memory leaks
- [ ] Efficient algorithms

### Testing
- [ ] Tests cover new functionality
- [ ] Edge cases tested
- [ ] Tests are meaningful (not just coverage)

## Output

- Review summary
- Line-by-line comments (via gh)
- Approval / request changes / comment

## Human Checkpoints

- Approve review before submission
- Confirm severity of issues found
