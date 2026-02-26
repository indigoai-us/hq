# Testing the my-hq Installer

This document provides comprehensive testing procedures for validating the my-hq installer on clean Windows and macOS systems.

## Overview

Before releasing the installer, it must be tested on clean machines to ensure it works for users who don't have any prerequisites installed. This validation is critical for the "zero terminal commands" promise.

## Quick Test Matrix

| Platform | Test Type | Prerequisites | Expected Result |
|----------|-----------|---------------|-----------------|
| Windows 10 | Clean Install | None | Full setup in < 5 min |
| Windows 11 | Clean Install | None | Full setup in < 5 min |
| Windows 10 | With Node.js | Node.js 18+ | Skips Node install |
| Windows 11 | With Node.js | Node.js 18+ | Skips Node install |
| macOS 13+ | Clean Install | None | Full setup in < 5 min |
| macOS 13+ | With Homebrew Node | Node.js 18+ via brew | Skips Node install |
| macOS 13+ | With nvm Node | Node.js 18+ via nvm | Skips Node install |

---

## Windows Testing

### Setting Up Test Environment

#### Option 1: Windows Sandbox (Recommended for Quick Tests)

Windows Sandbox provides a clean, disposable Windows environment:

1. Enable Windows Sandbox:
   ```powershell
   Enable-WindowsOptionalFeature -FeatureName "Containers-DisposableClientVM" -Online
   ```

2. Create a configuration file `test-installer.wsb`:
   ```xml
   <Configuration>
     <MappedFolders>
       <MappedFolder>
         <HostFolder>C:\path\to\installer\output</HostFolder>
         <ReadOnly>true</ReadOnly>
       </MappedFolder>
     </MappedFolders>
     <MemoryInMB>4096</MemoryInMB>
   </Configuration>
   ```

3. Double-click the .wsb file to launch sandbox with installer accessible

#### Option 2: Hyper-V Virtual Machine

For comprehensive testing:

1. Download Windows 10/11 evaluation ISO from Microsoft
2. Create new VM in Hyper-V Manager:
   - Generation 2
   - 4GB+ RAM
   - 50GB+ disk
   - Secure Boot disabled (for easier testing)
3. Install Windows, skip all optional features
4. Create a snapshot named "Clean Install"

#### Option 3: VMware/VirtualBox

1. Download Windows evaluation ISO
2. Create VM with 4GB RAM, 50GB disk
3. Install Windows, decline all optional features
4. Take snapshot before testing

### Windows Test Procedure

#### Pre-Flight Checks

Before running the installer, verify the clean state:

```powershell
# Should fail or not exist
node --version
npm --version
claude --version

# Check PATH for node/npm
$env:PATH -split ';' | Where-Object { $_ -match 'node' }
```

#### Installation Test

1. **Run Installer**
   - Double-click `my-hq-setup-1.0.0.exe`
   - Accept UAC prompt if shown

2. **UI Verification**
   - [ ] Welcome screen displays correctly with branding
   - [ ] Progress bar works during installation
   - [ ] No error dialogs appear

3. **Component Installation**
   - [ ] Node.js downloads and installs (or skips if present)
   - [ ] npm is accessible after install
   - [ ] Claude CLI installs via npm

4. **Claude Authentication**
   - [ ] OAuth page opens in browser (or offers to skip)
   - [ ] Skip option works without errors

5. **Post-Install**
   - [ ] my-hq folder created in chosen location
   - [ ] Setup wizard launches (or can be skipped)
   - [ ] Desktop shortcut created
   - [ ] Start Menu shortcuts created

#### Post-Installation Verification

Run these commands in a NEW terminal window:

```powershell
# Verify Node.js
node --version
# Expected: v20.x.x or v22.x.x

# Verify npm
npm --version
# Expected: 10.x.x

# Verify Claude CLI
claude --version
# Expected: 1.x.x or similar

# Verify my-hq installation
Get-ChildItem "$env:LOCALAPPDATA\my-hq" -Recurse | Select-Object FullName
# Expected: Files including CLAUDE.md, agents.md, etc.

# Test Claude in my-hq directory
cd "$env:LOCALAPPDATA\my-hq"
claude --help
# Expected: Help output with no errors
```

#### Uninstall Test

1. Open Settings > Apps > Installed Apps
2. Find "my-hq" and click Uninstall
3. Verify:
   - [ ] Uninstaller runs without errors
   - [ ] my-hq folder is removed (or user data preserved)
   - [ ] Start Menu shortcuts removed
   - [ ] Desktop shortcut removed

### Windows Edge Cases

| Scenario | Expected Behavior | Workaround |
|----------|-------------------|------------|
| No internet | Fails gracefully with message | Pre-download Node.js MSI |
| Slow connection | Shows progress, doesn't timeout | Increase timeout in script |
| Node.js v16 installed | Upgrades to v18+ | User must confirm upgrade |
| npm global path issues | Retries with fixed PATH | May need terminal restart |
| Antivirus blocks | Warning shown | User adds exception |
| Non-admin user | Requests elevation | Must have admin access |

---

## macOS Testing

### Setting Up Test Environment

#### Option 1: Fresh User Account (Recommended for Quick Tests)

1. Open System Preferences > Users & Groups
2. Create new "Standard" user account
3. Log into new account
4. Test installation there

#### Option 2: Virtual Machine (Parallels/VMware Fusion/UTM)

For Intel Macs or ARM with compatible VM software:

1. Download macOS installer from App Store
2. Create new VM (4GB+ RAM, 50GB+ disk)
3. Install macOS with minimal options
4. Create snapshot named "Clean Install"

Note: macOS VMs require macOS host due to licensing.

#### Option 3: Clean Install on Partition

For physical testing:
1. Create new APFS volume
2. Install fresh macOS
3. Boot to test partition for testing

### macOS Test Procedure

#### Pre-Flight Checks

Before running the installer, verify the clean state:

```bash
# Should fail or not exist
node --version
npm --version
claude --version

# Check if Homebrew is installed
which brew

# Check PATH
echo $PATH | tr ':' '\n' | grep -E 'node|npm'
```

#### Installation Test

1. **Run Installer**
   - Double-click `my-hq-1.0.0.pkg`
   - Enter password when prompted

2. **UI Verification**
   - [ ] Welcome page displays with branding
   - [ ] Readme page shows correct info
   - [ ] License page displays
   - [ ] Progress indicator works
   - [ ] Conclusion page shows next steps

3. **Component Installation**
   - [ ] Node.js downloads and installs (or skips if present)
   - [ ] npm is accessible
   - [ ] Claude CLI installs via npm

4. **Post-Install**
   - [ ] my-hq folder created in ~/my-hq
   - [ ] Setup wizard launches automatically
   - [ ] Desktop launcher (my-hq.app) created
   - [ ] authenticate-claude.sh script available

#### Post-Installation Verification

Open a NEW Terminal window and run:

```bash
# Verify Node.js
node --version
# Expected: v20.x.x or v22.x.x

# Verify npm
npm --version
# Expected: 10.x.x

# Verify Claude CLI
which claude
claude --version
# Expected: Path to claude, version output

# Verify my-hq installation
ls -la ~/my-hq
# Expected: CLAUDE.md, agents.md, USER-GUIDE.md, etc.

# Verify PATH includes npm global
echo $PATH | grep -o '/usr/local/bin\|/opt/homebrew/bin' | head -1
# Expected: Appropriate path for your architecture

# Test Claude in my-hq directory
cd ~/my-hq
claude --help
# Expected: Help output with no errors
```

#### Desktop Launcher Test

1. Double-click my-hq.app on Desktop
2. Verify:
   - [ ] Terminal opens
   - [ ] Changes to ~/my-hq directory
   - [ ] Claude CLI is accessible

#### Package Removal

macOS doesn't have built-in uninstaller, but test cleanup:

```bash
# Manual removal
rm -rf ~/my-hq
rm -rf ~/Desktop/my-hq.app
rm -rf ~/Desktop/Setup\ Wizard.app

# Note: Node.js and Claude CLI remain installed
```

### macOS Edge Cases

| Scenario | Expected Behavior | Workaround |
|----------|-------------------|------------|
| No internet | Fails gracefully with message | Bundle Node.js in pkg |
| Gatekeeper blocks | Shows security prompt | See CODE-SIGNING.md |
| nvm installed | May conflict with system Node | postinstall detects nvm |
| M1/M2/M3 Mac | Uses ARM64 Node.js | Automatically handled |
| Intel Mac | Uses x64 Node.js | Automatically handled |
| /usr/local not writable | npm global fails | Uses ~/.npm-global instead |
| zsh not default shell | PATH may not update | Also updates .bash_profile |

---

## Automated Test Scripts

### Windows Test Script

Save as `test-windows.ps1` and run in clean environment:

```powershell
# my-hq Installer Test Script for Windows
# Run this AFTER installation to verify everything works

$ErrorActionPreference = "Stop"
$testResults = @()

function Test-Command {
    param([string]$Command, [string]$Description)
    try {
        $result = Invoke-Expression $Command 2>&1
        if ($LASTEXITCODE -eq 0 -or $result) {
            Write-Host "[PASS] $Description" -ForegroundColor Green
            return @{Test=$Description; Status="PASS"; Output=$result}
        } else {
            Write-Host "[FAIL] $Description" -ForegroundColor Red
            return @{Test=$Description; Status="FAIL"; Output=$result}
        }
    } catch {
        Write-Host "[FAIL] $Description - $($_.Exception.Message)" -ForegroundColor Red
        return @{Test=$Description; Status="FAIL"; Output=$_.Exception.Message}
    }
}

Write-Host "=== my-hq Installation Test ===" -ForegroundColor Cyan
Write-Host ""

# Test Node.js
$testResults += Test-Command "node --version" "Node.js installed"

# Test npm
$testResults += Test-Command "npm --version" "npm installed"

# Test Claude CLI
$testResults += Test-Command "claude --version" "Claude CLI installed"

# Test my-hq directory exists
$hqPath = "$env:LOCALAPPDATA\my-hq"
if (Test-Path $hqPath) {
    Write-Host "[PASS] my-hq directory exists at $hqPath" -ForegroundColor Green
    $testResults += @{Test="my-hq directory exists"; Status="PASS"; Output=$hqPath}
} else {
    Write-Host "[FAIL] my-hq directory not found" -ForegroundColor Red
    $testResults += @{Test="my-hq directory exists"; Status="FAIL"; Output="Not found"}
}

# Test required files
$requiredFiles = @(
    ".claude\CLAUDE.md",
    "agents.md",
    "USER-GUIDE.md"
)

foreach ($file in $requiredFiles) {
    $fullPath = Join-Path $hqPath $file
    if (Test-Path $fullPath) {
        Write-Host "[PASS] File exists: $file" -ForegroundColor Green
        $testResults += @{Test="File: $file"; Status="PASS"; Output="Exists"}
    } else {
        Write-Host "[FAIL] Missing file: $file" -ForegroundColor Red
        $testResults += @{Test="File: $file"; Status="FAIL"; Output="Missing"}
    }
}

# Test Start Menu shortcut
$startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\my-hq"
if (Test-Path $startMenuPath) {
    Write-Host "[PASS] Start Menu shortcuts exist" -ForegroundColor Green
    $testResults += @{Test="Start Menu shortcuts"; Status="PASS"; Output=$startMenuPath}
} else {
    Write-Host "[WARN] Start Menu shortcuts not found (may be in different location)" -ForegroundColor Yellow
    $testResults += @{Test="Start Menu shortcuts"; Status="WARN"; Output="Not in expected location"}
}

# Summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$warnings = ($testResults | Where-Object { $_.Status -eq "WARN" }).Count

Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })
Write-Host "Warnings: $warnings" -ForegroundColor $(if ($warnings -gt 0) { "Yellow" } else { "Gray" })

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "INSTALLATION HAS ISSUES - Review failures above" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "INSTALLATION VERIFIED SUCCESSFULLY" -ForegroundColor Green
    exit 0
}
```

### macOS Test Script

Save as `test-macos.sh` and run in clean environment:

```bash
#!/bin/bash
# my-hq Installer Test Script for macOS
# Run this AFTER installation to verify everything works

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

test_command() {
    local cmd="$1"
    local description="$2"

    if output=$($cmd 2>&1); then
        echo -e "${GREEN}[PASS]${NC} $description"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $description"
        ((FAILED++))
        return 1
    fi
}

test_path() {
    local path="$1"
    local description="$2"

    if [[ -e "$path" ]]; then
        echo -e "${GREEN}[PASS]${NC} $description"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $description"
        ((FAILED++))
        return 1
    fi
}

echo -e "${CYAN}=== my-hq Installation Test ===${NC}"
echo ""

# Test Node.js
test_command "node --version" "Node.js installed"

# Test npm
test_command "npm --version" "npm installed"

# Test Claude CLI
test_command "which claude" "Claude CLI in PATH"
test_command "claude --version" "Claude CLI runs"

# Test my-hq directory
HQ_PATH="$HOME/my-hq"
test_path "$HQ_PATH" "my-hq directory exists at $HQ_PATH"

# Test required files
for file in ".claude/CLAUDE.md" "agents.md" "USER-GUIDE.md"; do
    test_path "$HQ_PATH/$file" "File exists: $file"
done

# Test Desktop launcher
test_path "$HOME/Desktop/my-hq.app" "Desktop launcher exists"

# Test authentication script
test_path "$HQ_PATH/authenticate-claude.sh" "Authentication helper script"

# Test PATH configuration
if echo "$PATH" | grep -q "npm"; then
    echo -e "${GREEN}[PASS]${NC} npm in PATH"
    ((PASSED++))
else
    echo -e "${YELLOW}[WARN]${NC} npm not explicitly in PATH (may still work)"
    ((WARNINGS++))
fi

# Check shell config
if grep -q "my-hq" "$HOME/.zshrc" 2>/dev/null; then
    echo -e "${GREEN}[PASS]${NC} Shell configuration updated (.zshrc)"
    ((PASSED++))
else
    echo -e "${YELLOW}[WARN]${NC} my-hq not found in .zshrc"
    ((WARNINGS++))
fi

# Summary
echo ""
echo -e "${CYAN}=== Test Summary ===${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo "Failed: $FAILED"
fi
if [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
else
    echo "Warnings: $WARNINGS"
fi

echo ""
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}INSTALLATION HAS ISSUES - Review failures above${NC}"
    exit 1
else
    echo -e "${GREEN}INSTALLATION VERIFIED SUCCESSFULLY${NC}"
    exit 0
fi
```

---

## Test Checklist

### Windows 10 Clean Install

- [ ] VM/Sandbox created from fresh Windows 10
- [ ] Verified no Node.js installed
- [ ] Verified no npm installed
- [ ] Verified no Claude CLI installed
- [ ] Ran installer
- [ ] Installer completed without errors
- [ ] Node.js version confirmed (v18+)
- [ ] npm version confirmed
- [ ] Claude CLI version confirmed
- [ ] my-hq folder created with all files
- [ ] Start Menu shortcuts work
- [ ] Desktop shortcut works
- [ ] Setup wizard completed or skipped
- [ ] `claude --help` works in my-hq directory
- [ ] Uninstall works cleanly
- [ ] Time to completion: ___ minutes

### Windows 11 Clean Install

- [ ] VM/Sandbox created from fresh Windows 11
- [ ] Verified no Node.js installed
- [ ] Verified no npm installed
- [ ] Verified no Claude CLI installed
- [ ] Ran installer
- [ ] Installer completed without errors
- [ ] Node.js version confirmed (v18+)
- [ ] npm version confirmed
- [ ] Claude CLI version confirmed
- [ ] my-hq folder created with all files
- [ ] Start Menu shortcuts work
- [ ] Desktop shortcut works
- [ ] Setup wizard completed or skipped
- [ ] `claude --help` works in my-hq directory
- [ ] Uninstall works cleanly
- [ ] Time to completion: ___ minutes

### macOS 13+ Clean Install

- [ ] Fresh user account or VM created
- [ ] Verified no Node.js installed
- [ ] Verified no npm installed
- [ ] Verified no Claude CLI installed
- [ ] Ran installer (.pkg)
- [ ] Installer completed without errors
- [ ] Node.js version confirmed (v18+)
- [ ] npm version confirmed
- [ ] Claude CLI version confirmed
- [ ] my-hq folder created with all files
- [ ] Desktop launcher (my-hq.app) works
- [ ] Setup wizard completed or skipped
- [ ] `claude --help` works in my-hq directory
- [ ] Time to completion: ___ minutes

---

## Known Issues and Workarounds

### Windows

1. **Windows Defender SmartScreen Warning**
   - Issue: Unsigned installer shows warning
   - Workaround: Click "More info" > "Run anyway"
   - Fix: Sign installer with code signing certificate (see CODE-SIGNING.md)

2. **PATH Not Immediately Available**
   - Issue: After Node.js install, `node` not found
   - Workaround: Open new terminal window
   - Note: Installer attempts PATH refresh but may not work in all environments

3. **Corporate Firewall Blocks Downloads**
   - Issue: Node.js download fails
   - Workaround: Pre-install Node.js or use bundled version
   - Alternative: Configure proxy in system settings

### macOS

1. **Gatekeeper Blocks Unsigned Package**
   - Issue: "cannot be opened because it is from an unidentified developer"
   - Workaround: Right-click > Open > Open
   - Fix: Sign and notarize package (see CODE-SIGNING.md)

2. **Apple Silicon vs Intel**
   - Issue: Wrong Node.js architecture
   - Note: postinstall auto-detects and downloads correct version
   - Verify: `node -p "process.arch"` should show arm64 or x64

3. **nvm Conflicts**
   - Issue: Users with nvm may have unexpected behavior
   - Note: postinstall detects nvm and shows warning
   - Workaround: Use nvm to install Node.js 18+, then skip Node install

4. **zsh vs bash**
   - Issue: PATH updates may not apply to all shells
   - Note: postinstall updates both .zshrc and .bash_profile
   - Verify: `echo $PATH` in both shells

---

## Reporting Test Results

After completing tests, document results in:

```
projects/hq-installer/test-results/
├── YYYY-MM-DD-windows10.md
├── YYYY-MM-DD-windows11.md
└── YYYY-MM-DD-macos.md
```

Template:

```markdown
# Test Results: [Platform] - [Date]

## Environment
- OS Version:
- VM/Hardware:
- Network:
- Tester:

## Results
- [ ] All automated tests pass
- [ ] Manual verification complete
- Time to complete: X minutes

## Issues Found
1. Issue description
   - Steps to reproduce
   - Expected vs actual
   - Severity (blocker/major/minor)

## Screenshots
(Attach if applicable)
```

---

## Continuous Integration

See `installer/ci/` for GitHub Actions workflows that automate build and basic testing.

For full integration tests on clean VMs, consider:
- Azure DevOps with Windows agents
- macOS GitHub Actions runners (though limited)
- Self-hosted runners with VM access
