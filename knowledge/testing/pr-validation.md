# PR Validation Tests for HQ

Tests to run before merging PRs to ensure quality.

## Automated Checks

### 1. File Existence (PRD-based)
```bash
# For any completed PRD, verify all files in "files" arrays exist
jq -r '.features[].files[]' projects/{project}/prd.json | while read f; do
  [ -f "$f" ] && echo "PASS: $f" || echo "FAIL: $f"
done
```

### 2. Syntax Validation

**YAML files:**
```bash
python -c "import yaml; yaml.safe_load(open('$file'))"
```

**JSON files:**
```bash
python -c "import json; json.load(open('$file'))"
```

**PowerShell scripts:**
```powershell
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errors)
if ($errors.Count -gt 0) { throw "Syntax errors" }
```

**Bash scripts:**
```bash
bash -n "$script"
```

### 3. Worker Registry Consistency
```bash
# Every worker in registry.yaml should have a worker.yaml file
yq '.workers[].id' workers/registry.yaml | while read id; do
  [ -f "workers/dev-team/$id/worker.yaml" ] || echo "MISSING: $id"
done
```

### 4. Command File Structure
```bash
# Commands should have title and at least one ## section
for cmd in .claude/commands/*.md; do
  grep -q "^# " "$cmd" && grep -q "^## " "$cmd" || echo "FAIL: $cmd"
done
```

### 5. Cross-Reference Integrity
```bash
# Files referenced in worker.yaml context.base should exist
# Skills referenced in worker.yaml should have .md files
# dependsOn in PRDs should reference valid task IDs
```

### 6. Schema Validation (if JSON schemas exist)
```bash
# Validate instances against their schemas
npx ajv validate -s schema.json -d instance.json
```

## Functional Tests

### Orchestrator Tests
```powershell
# Test completion detection with both formats
$prd = '{"features":[{"passes":true},{"status":"completed"}]}'
# Should count 2 complete

# Test fork detection
# Should detect myfork/fork remotes and extract upstream
```

### Command Tests (Manual)
- `/prd` - Creates valid PRD structure
- `/newworker` - Creates worker with all required files
- `/pure-ralph` - Launches external terminal

## When to Run

- **Pre-merge**: All automated checks
- **Post-merge**: Smoke test key commands
- **Weekly**: Full functional test suite

## CI Integration (Future)

Could add GitHub Action that runs on PR:
```yaml
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate YAML
        run: python -c "import yaml; [yaml.safe_load(open(f)) for f in glob('**/*.yaml')]"
      - name: Validate JSON
        run: python -c "import json; [json.load(open(f)) for f in glob('**/*.json')]"
      - name: Check bash syntax
        run: find . -name "*.sh" -exec bash -n {} \;
```
