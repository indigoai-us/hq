# Edge Cases and Workarounds

This document consolidates known edge cases, platform-specific quirks, and their workarounds for the my-hq installer.

## Windows

### 1. Windows Defender SmartScreen Warning

**Symptom:** "Windows protected your PC" dialog appears when running unsigned installer.

**Cause:** Installer is not code-signed with an EV certificate.

**Workaround:**
1. Click "More info"
2. Click "Run anyway"

**Permanent Fix:** Sign installer with code signing certificate (see `windows/CODE-SIGNING.md`).

---

### 2. PATH Not Updated in Current Session

**Symptom:** After installation, `node` or `claude` command not found in same terminal.

**Cause:** Environment variables are not refreshed in existing processes.

**Workaround:**
1. Open a new Command Prompt or PowerShell window
2. Or run: `$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")`

**Note:** The installer attempts to broadcast WM_SETTINGCHANGE but this doesn't affect already-running terminals.

---

### 3. Node.js MSI Requires Admin Rights

**Symptom:** Node.js installation fails with access denied.

**Cause:** MSI installations require administrator privileges.

**Workaround:** Run installer "as Administrator" explicitly:
1. Right-click installer
2. Select "Run as administrator"

**Note:** The installer should request UAC elevation automatically.

---

### 4. Corporate Proxy Blocks Downloads

**Symptom:** Node.js download hangs or fails.

**Cause:** Corporate firewalls/proxies block external downloads.

**Workaround:**
1. Configure system proxy in Windows Settings
2. Or pre-install Node.js manually before running installer
3. Or use bundled installer version with embedded Node.js

---

### 5. npm Global Packages Not in PATH

**Symptom:** `claude` command not found after npm install succeeds.

**Cause:** npm global bin directory not in PATH.

**Workaround:**
```powershell
# Find npm global directory
npm config get prefix

# Add to PATH (adjust path as needed)
$npmPath = (npm config get prefix)
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";$npmPath", "User")
```

---

### 6. Windows 10 LTSC/Enterprise Missing Components

**Symptom:** Various installer features may not work.

**Cause:** LTSC editions remove some Windows features.

**Workaround:** Ensure the following are available:
- Windows Installer service running
- Internet Explorer/Edge for OAuth
- Standard temp directories accessible

---

### 7. Antivirus Quarantines Installer

**Symptom:** Installer disappears or fails to run.

**Cause:** Heuristic detection flags unknown executables.

**Workaround:**
1. Add exception for `my-hq-setup-*.exe`
2. Or temporarily disable real-time protection
3. Or use signed version when available

---

### 8. Old Node.js Version Detected but Not Upgraded

**Symptom:** Installation proceeds with Node.js < 18.

**Cause:** Detection finds Node.js but doesn't check version.

**Current behavior:** Installer should detect version and offer upgrade.

**Manual workaround:**
```powershell
# Uninstall old Node.js first
winget uninstall Node.js

# Then run installer
```

---

## macOS

### 1. Gatekeeper Blocks Unsigned Package

**Symptom:** "cannot be opened because it is from an unidentified developer"

**Cause:** Package not signed with Apple Developer ID.

**Workaround:**
1. Right-click (or Control-click) the .pkg file
2. Select "Open"
3. Click "Open" in the dialog

**Permanent Fix:** Sign and notarize package (see `macos/CODE-SIGNING.md`).

---

### 2. Apple Silicon vs Intel Architecture Mismatch

**Symptom:** Node.js crashes or runs slowly under Rosetta.

**Cause:** Wrong architecture Node.js downloaded.

**Detection:** The installer detects architecture via `uname -m`:
- `arm64` = Apple Silicon (M1/M2/M3)
- `x86_64` = Intel

**Workaround:** If wrong version installed:
```bash
# Remove system Node
sudo rm -rf /usr/local/lib/node_modules
sudo rm /usr/local/bin/node /usr/local/bin/npm

# Install correct version manually
# For Apple Silicon:
curl -o node.pkg "https://nodejs.org/dist/v20.11.0/node-v20.11.0-darwin-arm64.pkg"
# For Intel:
curl -o node.pkg "https://nodejs.org/dist/v20.11.0/node-v20.11.0-darwin-x64.pkg"
sudo installer -pkg node.pkg -target /
```

---

### 3. nvm Conflicts with System Node

**Symptom:** Installer installs Node.js but `node` command uses nvm version.

**Cause:** nvm modifies PATH to prioritize its versions.

**Detection:** Installer checks for `$NVM_DIR` or nvm in shell config.

**Workaround:**
1. Use nvm to install Node.js 18+: `nvm install 18`
2. Set as default: `nvm alias default 18`
3. Skip Node.js installation in installer

**Note:** The installer should detect nvm and skip system Node installation.

---

### 4. Homebrew Node.js Conflicts

**Symptom:** Multiple Node.js installations cause confusion.

**Cause:** Homebrew installs to `/opt/homebrew/bin` (ARM) or `/usr/local/bin` (Intel).

**Detection:** Installer checks `which node` and version before installing.

**Workaround:** If using Homebrew Node:
```bash
# Verify version is 18+
node --version

# If not, upgrade:
brew upgrade node
```

---

### 5. /usr/local Not Writable

**Symptom:** npm global install fails.

**Cause:** macOS Catalina+ protects /usr/local on some configurations.

**Workaround:**
```bash
# Option 1: Fix permissions
sudo chown -R $(whoami) /usr/local

# Option 2: Use ~/.npm-global
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
```

---

### 6. zsh vs bash Shell Differences

**Symptom:** PATH updates don't take effect.

**Cause:** macOS Catalina+ defaults to zsh, but some users use bash.

**Detection:** Installer updates both `.zshrc` and `.bash_profile`.

**Workaround:**
```bash
# Check current shell
echo $SHELL

# For zsh (default):
source ~/.zshrc

# For bash:
source ~/.bash_profile
```

---

### 7. SIP Prevents /etc/paths.d Modification

**Symptom:** Can't create /etc/paths.d/my-hq.

**Cause:** System Integrity Protection on some configurations.

**Workaround:** Use shell config files instead:
```bash
# Add to ~/.zshrc
echo 'export PATH="$PATH:/usr/local/bin"' >> ~/.zshrc
```

---

### 8. Terminal.app vs iTerm2 vs Other Terminals

**Symptom:** Desktop launcher opens wrong terminal or fails.

**Detection:** The launcher uses `open -a Terminal.app` by default.

**Workaround:** Edit `my-hq.app/Contents/MacOS/my-hq` to use preferred terminal:
```bash
# For iTerm2:
open -a iTerm ~/my-hq

# For VS Code integrated terminal:
code ~/my-hq
```

---

## Cross-Platform

### 1. Slow or Unreliable Internet

**Symptom:** Downloads timeout or fail intermittently.

**Mitigation:**
- Installer uses HTTPS with redirects
- Retry logic for failed downloads
- Clear error messages on failure

**Workaround for offline install:**
1. Pre-download Node.js installer
2. Install Node.js manually
3. Run my-hq installer (will skip Node.js)

---

### 2. Disk Space Insufficient

**Symptom:** Installation fails partway through.

**Requirements:**
- Node.js: ~100MB
- Claude CLI: ~50MB
- my-hq template: ~1MB
- Total recommended: 500MB free

**Detection:** Installer should check free space before starting.

---

### 3. Interrupted Installation

**Symptom:** Partial installation, broken state.

**Recovery:**
1. Windows: Use "Apps & Features" to uninstall, then reinstall
2. macOS: Delete `~/my-hq` and reinstall

**Note:** Installer should be idempotent (safe to run multiple times).

---

### 4. Reinstall Over Existing Installation

**Symptom:** Configuration files overwritten.

**Current behavior:** Installer should detect existing installation and:
1. Preserve user-modified files (agents.md)
2. Update system files (CLAUDE.md, etc.)
3. Show warning before overwriting

**Workaround:** Backup `~/my-hq/agents.md` before reinstalling.

---

### 5. Claude CLI OAuth Failure

**Symptom:** OAuth flow doesn't complete, Claude not authenticated.

**Causes:**
- Browser doesn't open
- Popup blocked
- Network issues
- User closes browser too early

**Workaround:**
```bash
# Manual authentication
cd ~/my-hq  # or %LOCALAPPDATA%\my-hq on Windows
claude login

# Or skip during install and run later:
./authenticate-claude.sh  # macOS
# Windows: Run "Authenticate Claude" from Start Menu
```

---

## Testing Recommendations

Based on these edge cases, test the following scenarios:

### Must Test (Blockers if fail)
- [ ] Clean Windows 10 x64 - no prerequisites
- [ ] Clean Windows 11 x64 - no prerequisites
- [ ] Clean macOS (Intel) - no prerequisites
- [ ] Clean macOS (Apple Silicon) - no prerequisites

### Should Test (Major issues if fail)
- [ ] Windows with old Node.js (v16)
- [ ] macOS with Homebrew Node.js
- [ ] macOS with nvm
- [ ] Reinstall over existing installation

### Nice to Test (Minor issues if fail)
- [ ] Windows Sandbox
- [ ] Windows LTSC edition
- [ ] macOS fresh user account
- [ ] Slow network (throttled)
- [ ] Interrupted and resumed installation
