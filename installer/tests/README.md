# my-hq Installer Test Documentation

This document describes how to run and troubleshoot installer tests for my-hq across Windows and macOS platforms.

## Overview

The installer test suite verifies that the my-hq installation works correctly by checking:

- **Core dependencies**: Node.js (18+), npm (8+), Claude CLI
- **Directory structure**: my-hq folder, required files (CLAUDE.md, agents.md, USER-GUIDE.md)
- **HQ functionality**: Slash commands, worker definitions, workspace directories
- **Platform integration**: Shortcuts (Windows), shell configuration (macOS), PATH setup
- **Optional components**: Setup wizard, update checker, version files

Tests output a structured JSON summary for CI parsing and provide colored console output for local debugging.

## Test Scripts

| Platform | Script | Location |
|----------|--------|----------|
| Windows | `test-windows.ps1` | `installer/tests/test-windows.ps1` |
| macOS | `test-macos.sh` | `installer/tests/test-macos.sh` |

## Local Windows Testing

### Option 1: Windows Sandbox (Recommended)

Windows Sandbox provides an isolated, disposable environment that closely mimics a fresh Windows install. This is the most reliable way to test the installer locally.

**Prerequisites:**
- Windows 10/11 Pro, Enterprise, or Education
- Windows Sandbox feature enabled

**Enable Windows Sandbox:**
```powershell
Enable-WindowsOptionalFeature -FeatureName "Containers-DisposableClientVM" -All -Online
```

**Testing Steps:**
1. Open Windows Sandbox from the Start Menu
2. Copy the installer (`my-hq-setup-1.0.0.exe`) into the sandbox (drag and drop)
3. Run the installer in the sandbox
4. Copy the test script into the sandbox
5. Run the verification tests:
   ```powershell
   powershell -ExecutionPolicy Bypass -File test-windows.ps1
   ```
6. Review results; sandbox is destroyed when closed

**Tip:** Create a `.wsb` configuration file to automate installer copying:
```xml
<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>C:\path\to\installer\windows</HostFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
</Configuration>
```

### Option 2: Docker Windows Containers

For CI-like local testing, use Windows containers.

**Prerequisites:**
- Docker Desktop with Windows containers enabled
- Switch Docker to Windows containers mode

**Testing Steps:**
```powershell
# Build a test container
docker build -t hq-installer-test -f Dockerfile.windows .

# Run the installer in the container
docker run --rm hq-installer-test
```

**Note:** Windows containers are heavy (10+ GB) and slower than Linux containers. Use this method for CI parity testing, not daily development.

### Option 3: Direct Test Script Execution

For quick checks on a development machine (not a clean environment):

```powershell
# Run with default installation path
.\test-windows.ps1

# Specify custom installation path
.\test-windows.ps1 -HqPath "C:\custom\path\my-hq"

# Run with verbose output
.\test-windows.ps1 -Verbose

# Run in CI mode (skips GUI tests, OAuth verification)
.\test-windows.ps1 -CI
```

**Environment Variables:**
```powershell
$env:CI = "true"           # Enable CI mode
$env:GITHUB_ACTIONS = "true"  # Also enables CI mode
```

**Exit Codes:**
- `0` - All tests passed (or passed with warnings)
- `1` - One or more tests failed

## Local macOS Testing

### Option 1: Fresh User Account (Recommended)

Creating a new macOS user account provides a clean environment without requiring virtualization.

**Steps:**
1. Create a new user account:
   - System Settings > Users & Groups > Add User
   - Create a Standard user (not Admin)
   - Name it something like "HQ Test"

2. Log in as the test user

3. Run the installer:
   ```bash
   # If using the .pkg installer
   sudo installer -pkg /path/to/my-hq-1.0.0.pkg -target /

   # If using the shell script installer
   curl -fsSL https://raw.githubusercontent.com/your-repo/my-hq/main/installer/macos/install.sh | bash
   ```

4. Run verification tests:
   ```bash
   chmod +x test-macos.sh
   ./test-macos.sh
   ```

5. Delete the test user when done:
   - Log out, log into your main account
   - System Settings > Users & Groups > Delete "HQ Test"

### Option 2: Direct Test Script Execution

For development testing on your existing account:

```bash
# Make script executable
chmod +x test-macos.sh

# Run with default path ($HOME/my-hq)
./test-macos.sh

# Specify custom path
HQ_PATH="/custom/path/my-hq" ./test-macos.sh

# Enable verbose output
VERBOSE=true ./test-macos.sh

# Run in CI mode (skips GUI tests, OAuth verification)
CI=true ./test-macos.sh
```

**Environment Variables:**
- `HQ_PATH` - Custom installation directory (default: `$HOME/my-hq`)
- `VERBOSE` - Show verbose output (default: `false`)
- `CI` - Enable CI mode, skips browser-dependent tests (default: `false`)
- `GITHUB_ACTIONS`, `TRAVIS`, `CIRCLECI`, `JENKINS_URL` - Auto-enable CI mode

**Exit Codes:**
- `0` - All tests passed (or passed with warnings)
- `1` - One or more tests failed

## CI Workflow

### Automatic Triggers

The CI workflow (`test-installer.yml`) runs automatically on:
- Pull requests that modify files in `installer/**`
- Target branches: `main`, `staging`

### Manual Trigger

To run the workflow manually:

1. Go to the repository on GitHub
2. Navigate to **Actions** > **Test Installer**
3. Click **Run workflow**
4. Optionally enable debug logging
5. Click **Run workflow**

Or use the GitHub CLI:
```bash
# Run workflow on current branch
gh workflow run test-installer.yml

# Run with debug enabled
gh workflow run test-installer.yml -f debug_enabled=true

# Run on specific branch
gh workflow run test-installer.yml --ref feature/my-branch
```

### Workflow Jobs

The CI workflow runs three jobs:

| Job | Platform | Description |
|-----|----------|-------------|
| `test-windows` | `windows-latest` | Builds NSIS installer, runs it, verifies installation |
| `test-macos` | `macos-latest` | Builds .pkg installer, installs it, verifies installation |
| `summary` | `ubuntu-latest` | Reports overall pass/fail status |

Windows and macOS jobs run in parallel for faster feedback.

### CI Artifacts

On successful runs, installers are uploaded as artifacts:
- `windows-installer`: `my-hq-setup-1.0.0.exe`
- `macos-installer`: `my-hq-1.0.0.pkg`

Artifacts are retained for 7 days.

## Troubleshooting

### Common CI Failures

#### "Claude CLI not installed"

**In CI:** This is expected and logged as INFO, not FAIL. The Claude CLI requires npm network access that may be restricted in CI environments.

**Locally:** Ensure npm is in your PATH and run:
```bash
npm install -g @anthropic-ai/claude-code
```

#### "NSIS not found" (Windows)

The NSIS cache may be corrupted. Clear the cache and re-run:
1. Go to **Actions** > **Caches**
2. Delete caches matching `nsis-windows-*`
3. Re-run the workflow

Or locally:
```powershell
choco install nsis -y --force
```

#### "my-hq directory not found"

The installer may not have created the directory:
- **Windows:** Check `%LOCALAPPDATA%\my-hq`
- **macOS:** Check `$HOME/my-hq`

Verify the installer ran without errors. Check the installer logs.

#### "Slash commands directory empty"

The HQ template may not have been copied correctly. Verify:
- Windows installer bundles the template in the NSIS script
- macOS installer includes files in the payload

#### macOS "permission denied"

Ensure scripts are executable:
```bash
chmod +x test-macos.sh
chmod +x installer/macos/build-pkg.sh
```

#### Windows execution policy

If PowerShell blocks script execution:
```powershell
powershell -ExecutionPolicy Bypass -File test-windows.ps1
```

### Cache Issues

#### NSIS Cache (Windows)

Cache key: `nsis-windows-3.09-plugins-v2`

Cached paths:
- `C:\Program Files (x86)\NSIS`

To bust the cache, increment the version suffix in the workflow file or delete the cache via GitHub UI.

#### Node.js Cache

Node.js is installed fresh via `actions/setup-node@v4` and not cached. If you need to cache node_modules, add:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
```

### Platform-Specific Gotchas

#### Windows

- **Path length limits:** Windows has a 260-character path limit by default. Long nested paths in my-hq can cause issues. Enable long paths:
  ```powershell
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
  ```

- **Antivirus interference:** Windows Defender may quarantine the unsigned installer. Add an exclusion for the build directory or sign the installer.

- **Admin vs User install:** The NSIS installer installs to `%LOCALAPPDATA%\my-hq` (user-level) by default. Modify the NSI script for system-wide installs.

#### macOS

- **Gatekeeper blocking:** Unsigned .pkg installers trigger Gatekeeper warnings. Users must right-click > Open to bypass, or you must sign/notarize the package.

- **SIP restrictions:** System Integrity Protection may block modifications to `/usr/local`. The installer uses user-level paths (`$HOME/my-hq`) to avoid this.

- **Shell configuration:** The installer modifies `~/.zshrc` or `~/.bash_profile`. If users have custom shell configs (fish, nushell), they need manual PATH setup.

- **Apple Silicon vs Intel:** The test script works on both architectures, but verify both if distributing binaries.

### Reading Test Output

Both test scripts output a JSON summary at the end:

```json
{
  "timestamp": "2025-01-31T10:00:00Z",
  "environment": {
    "os": "windows",
    "ci": true,
    "hq_path": "C:\\Users\\runner\\AppData\\Local\\my-hq"
  },
  "results": {
    "total": 25,
    "passed": 22,
    "failed": 0,
    "warnings": 2,
    "info": 1,
    "skipped": 3
  },
  "overall": {
    "result": "pass_with_warnings",
    "message": "Tests passed with warnings",
    "exit_code": 0
  },
  "failed_tests": []
}
```

**Status meanings:**
- **PASS:** Test passed
- **FAIL:** Test failed (causes non-zero exit)
- **WARN:** Non-critical issue (test passes overall)
- **INFO:** Informational only
- **SKIP:** Test skipped (usually in CI mode)

## Adding New Tests

To add a new verification test:

### Windows (PowerShell)

```powershell
# Add to test-windows.ps1

# Using Test-Command for CLI commands
$testResults += Test-Command "my-new-command --version" "My new command works" -MinVersion "1.0.0"

# Using Test-PathExists for file/directory checks
$testResults += Test-PathExists "$HqPath\new-file.txt" "New file exists"

# Custom test logic
if (Some-Condition) {
    Write-TestResult "PASS" "Custom test passed"
    $testResults += @{Test = "Custom test"; Status = "PASS"; Output = "Details"}
} else {
    Write-TestResult "FAIL" "Custom test failed"
    $testResults += @{Test = "Custom test"; Status = "FAIL"; Output = "Error details"}
}
```

### macOS (Bash)

```bash
# Add to test-macos.sh

# Using test_command for CLI commands
test_command "my-new-command --version" "My new command works" "1.0.0" || true

# Using test_path for file/directory checks
test_path "$HQ_PATH/new-file.txt" "New file exists" || true

# Custom test logic
if some_condition; then
    print_result "PASS" "Custom test passed"
else
    print_result "FAIL" "Custom test failed"
fi
```

## Related Documentation

- [Windows Installer Build Guide](../windows/BUILD.md)
- [macOS Installer Build Guide](../macos/BUILD.md)
- [HQ Template](../template/README.md)
- [Download Landing Page](../docs/README.md)
- [General Testing Guide](../TESTING.md) - Comprehensive testing procedures
- [Edge Cases](../EDGE-CASES.md) - Known edge cases and handling
