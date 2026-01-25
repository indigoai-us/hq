Sync HQ modules from the manifest. This skill wraps the `hq` CLI.

## Commands

**Sync all modules:**
```bash
hq modules sync
```

**Sync with locked versions:**
```bash
hq modules sync --locked
```

**List modules:**
```bash
hq modules list
```

**Update lock for a module:**
```bash
hq modules update <module-name>
```

## Steps

1. Run `hq modules list` to show current module status
2. If user wants to sync, run `hq modules sync`
3. If there are conflicts (files with local changes), report them to the user:
   - Use AskUserQuestion to ask: "The following files have local changes: [list]. What should I do?"
   - Options: "Keep local" (skip), "Take remote" (overwrite), "Show diff" (show changes)
4. Report final sync results

## Conflict Handling

When you see output like:
```
Conflict: path/to/file has local changes, skipping
```

Ask the user what to do with each conflicted file before proceeding.

## Notes

- The `modules/` directory is gitignored (contains cloned repos)
- `modules.lock` tracks pinned versions for reproducibility
- `.hq-sync-state.json` tracks merged files for conflict detection
