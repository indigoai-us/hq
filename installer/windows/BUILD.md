# Building the HQ Windows Installer

This guide explains how to build and sign the HQ Windows installer.

## Prerequisites

1. **NSIS 3.x** - Download from https://nsis.sourceforge.io/Download
2. **NSIS Plugins:**
   - INetC - For downloading files with progress (included in NSIS)
   - nsDialogs - For custom pages (included in NSIS)

## Project Structure

```
installer/windows/
├── hq-installer.nsi      # Main installer script
├── assets/               # Icons and banners
│   ├── hq-icon.ico
│   ├── hq-uninstall.ico
│   ├── welcome-banner.bmp
│   └── header.bmp
├── BUILD.md              # This file
└── CODE-SIGNING.md       # Code signing guide
```

## Building the Installer

### 1. Prepare Assets

Create the required image assets in the `assets/` folder. See `assets/README.md` for specifications.

### 2. Prepare Template Files

The installer can work in two modes:

**Option A: Bundled Template (Recommended for Distribution)**

The template files are in `../../template/`. To bundle them with the installer:

```cmd
:: Compile with bundled template
makensis /DBUNDLED_TEMPLATE hq-installer.nsi
```

**Option B: Downloaded Template (Smaller Installer)**

Without the `BUNDLED_TEMPLATE` flag, the installer will:
1. Try to download the template from GitHub releases
2. Fall back to creating a minimal directory structure if download fails

```cmd
:: Compile without bundled template
makensis hq-installer.nsi
```

**Note:** You may need to install the `nsisunz` plugin for zip extraction:
- Download from https://nsis.sourceforge.io/Nsisunz_plug-in
- Extract to NSIS plugins directory

### 3. Compile the Installer

**Using NSIS GUI:**
1. Open NSIS (MakeNSISW)
2. Drag and drop `hq-installer.nsi` onto the window
3. Click "Compile"

**Using Command Line:**
```cmd
makensis hq-installer.nsi
```

**Using PowerShell:**
```powershell
& "C:\Program Files (x86)\NSIS\makensis.exe" hq-installer.nsi
```

### 4. Output

The compiled installer will be created as:
```
hq-setup-1.0.0.exe
```

## Customization

### Changing Version Number

Edit the version at the top of `hq-installer.nsi`:
```nsis
!define PRODUCT_VERSION "1.0.0"
```

### Changing Default Install Location

The default is `$LOCALAPPDATA\HQ` (e.g., `C:\Users\{username}\AppData\Local\HQ`).

To change, modify:
```nsis
InstallDir "$LOCALAPPDATA\HQ"
```

Other options:
- `$DOCUMENTS\HQ` - Documents folder
- `$PROFILE\HQ` - User home directory
- `$PROGRAMFILES\HQ` - Program Files (requires admin rights)

### Bundling vs Downloading Node.js

The current script downloads Node.js during installation. To embed Node.js:

1. Download the Node.js MSI installer
2. Place it in the installer directory
3. Modify SEC02 to use `File` instead of `INetC::get`

```nsis
Section "Node.js" SEC02
    ${If} $NodeJSInstalled != "true"
        SetOutPath "$TEMP"
        File "node-v20.11.0-x64.msi"
        nsExec::ExecToLog 'msiexec /i "$TEMP\node-v20.11.0-x64.msi" /qn /norestart'
        ; ...
    ${EndIf}
SectionEnd
```

## Testing

### Test on Clean Windows VM

1. Create a Windows VM snapshot before testing
2. Run the installer
3. Verify:
   - Node.js is installed: `node --version`
   - Claude CLI is installed: `claude --version`
   - HQ files are in the install directory
   - Start Menu shortcuts work
   - Desktop shortcut works
   - Uninstaller works (via Control Panel)

### Test Scenarios

- [ ] Fresh Windows install (no Node.js, no npm)
- [ ] Windows with old Node.js (< v18)
- [ ] Windows with current Node.js (>= v18)
- [ ] Upgrade from previous HQ version
- [ ] Uninstall and reinstall

## Troubleshooting

### "INetC" Plugin Not Found

Install the INetC plugin:
1. Download from https://nsis.sourceforge.io/Inetc_plug-in
2. Extract to NSIS plugins directory

### Node.js Installation Fails

The installer runs Node.js MSI silently. If it fails:
1. Check Windows Event Log for MSI errors
2. Try running the MSI manually to see error messages
3. Ensure user has admin rights

### Claude CLI Installation Fails

npm may not be in PATH immediately after Node.js install. The script attempts to refresh the environment, but a reboot may be needed in some cases.

## Related Files

- `hq-installer.nsi` - Main installer script
- `CODE-SIGNING.md` - How to sign the installer
- `assets/README.md` - Asset creation guide
