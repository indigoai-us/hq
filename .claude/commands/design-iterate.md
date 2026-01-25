---
description: Manage design iterations with git branches for A/B testing and easy revert
allowed-tools: Task, Read, Glob, Grep, Bash, Edit, Write, WebFetch, AskUserQuestion, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__read_page, mcp__Claude_in_Chrome__find
argument-hint: [component] [version] or "compare" or "list"
---

# /design-iterate - Design Iteration Workflow

Manage design variations using git branches. Test, compare, choose, or revert.

**Usage:**
```
/design-iterate                      # Show current iterations
/design-iterate {component} v1       # Create v1 branch for component
/design-iterate {component} v2       # Create v2 branch for component
/design-iterate compare              # List all design branches with deploy URLs
/design-iterate choose {branch}      # Merge chosen branch to main
/design-iterate revert               # Revert to previous design state
```

**User's input:** $ARGUMENTS

## Process

### No Arguments → Show Status

List active design iterations:
1. Run `git branch | grep "design/"` to find design branches
2. Show current branch
3. List pending design experiments

### Create Version → {component} {version}

1. **Branch**: Create `design/{component}-{version}` from current branch
   ```bash
   git checkout -b design/{component}-{version}
   ```

2. **Implement**: Make the design changes to the component

3. **Commit**:
   ```bash
   git add -A && git commit -m "design: {component} {version} - {description}"
   ```

4. **Deploy Preview**:
   ```bash
   vercel --yes  # Creates preview URL
   ```

5. **Record**: Save preview URL for comparison

### Compare → List All Versions

Show table of design branches:

| Branch | Component | Preview URL | Status |
|--------|-----------|-------------|--------|
| design/navbar-v1 | navbar | https://xxx.vercel.app | deployed |
| design/navbar-v2 | navbar | https://yyy.vercel.app | deployed |

Use browser tools to take screenshots if requested.

### Choose → Merge Winner

1. Checkout main: `git checkout main`
2. Merge winner: `git merge design/{component}-{version}`
3. Push: `git push`
4. Deploy production: `vercel --prod --yes`
5. Cleanup: Optionally delete other design branches

### Revert → Undo Design

1. `git log --oneline -10` to find commit before change
2. `git revert {commit}` to undo
3. Redeploy

## Design Branch Naming

Format: `design/{component}-v{N}`

Examples:
- `design/navbar-v1` - First navbar iteration
- `design/navbar-v2` - Second navbar iteration
- `design/hero-v1` - Hero section variation
- `design/footer-dark` - Footer dark mode

## Best Practices

1. **One component per branch** - Keep iterations focused
2. **Deploy each version** - Get preview URLs for comparison
3. **Document changes** - Commit messages should describe what changed
4. **Screenshot comparisons** - Use browser tools to capture before/after
5. **Clean up** - Delete unused design branches after choosing winner

## Example Session

```
User: let's iterate on the navbar design

Claude:
1. git checkout -b design/navbar-v1
2. [makes changes - bigger text, more padding]
3. git commit -m "design: navbar v1 - larger text, more visible"
4. vercel --yes
5. Preview: https://marketing-co-site-xyz.vercel.app

Want to create v2 with a different approach, or compare this to main?
```

## Integration with Workers

This skill works with:
- `frontend-designer` worker for MCP-powered design tools
- Visual QA via browser automation
- Vercel for preview deployments

## Notes

- Always deploy preview before switching branches
- Main branch stays stable; experiments happen in design/* branches
- Use `--yes` flag with vercel to skip prompts
