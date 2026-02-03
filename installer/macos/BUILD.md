# Building the HQ macOS Installer

This guide explains how to build the HQ macOS .pkg installer.

## Prerequisites

1. **macOS with Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

2. **Required tools** (included with Xcode CLT):
   - `pkgbuild` - Creates component packages
   - `productbuild` - Creates product archives
   - `productsign` - Signs packages

## Project Structure

```
installer/macos/
├── build-pkg.sh          # Main build script
├── BUILD.md              # This file
├── CODE-SIGNING.md       # Signing and notarization guide
├── assets/               # Icons and images
│   ├── background.png    # Installer background
│   └── icon.icns         # Product icon
├── resources/            # Installer UI content
│   ├── welcome.html      # Welcome page
│   ├── readme.html       # Read me page
│   ├── license.html      # License agreement
│   └── conclusion.html   # Completion page
└── scripts/              # Install scripts
    ├── preinstall        # Pre-installation script
    └── postinstall       # Post-installation script
```

## Building the Installer

### Quick Build

```bash
cd installer/macos
chmod +x build-pkg.sh
./build-pkg.sh
```

Output: `build/hq-1.0.0.pkg`

### Build Options

**With bundled template (recommended for distribution):**
```bash
./build-pkg.sh
```
The script looks for template files in `../../template/`. If found, they are bundled.

**Download template during install:**

If the template directory doesn't exist, the build script will create minimal files. The postinstall script handles downloading the full template if available.

**Environment variables:**
```bash
DOWNLOAD_TEMPLATE=true ./build-pkg.sh  # Enable template download during build
```

### Build with Signing

```bash
./build-pkg.sh "Developer ID Installer: Your Name (TEAM_ID)"
```

### Manual Build Steps

If you prefer to run each step manually:

```bash
# 1. Create build directory
mkdir -p build/payload/hq

# 2. Copy template files
cp -R ../../template/* build/payload/hq/

# 3. Build component package
pkgbuild \
    --root build/payload \
    --identifier com.hq.installer \
    --version 1.0.0 \
    --scripts scripts \
    --install-location "/" \
    build/hq-component.pkg

# 4. Build product package
productbuild \
    --distribution build/distribution.xml \
    --resources resources \
    --package-path build \
    build/hq-1.0.0.pkg
```

## Customization

### Changing Version

Edit `build-pkg.sh`:
```bash
PRODUCT_VERSION="1.0.0"
```

### Changing Install Location

The default is `~/hq` (user's home directory). This is set in:
- `scripts/postinstall` - `DEST_DIR` variable
- `resources/readme.html` and `conclusion.html` - Documentation

### Bundling vs Downloading Node.js

The installer downloads Node.js during installation. To bundle it:

1. Download the Node.js .pkg for macOS
2. Extract the payload: `pkgutil --expand-full node-v20.pkg node_expanded`
3. Include files in your payload
4. Skip the download step in `postinstall`

### Custom Branding

1. **Background image**: Replace `resources/background.png` (620x418 recommended)
2. **Welcome/Conclusion**: Edit HTML files in `resources/`
3. **Colors**: Update CSS in HTML files (current theme: purple/indigo gradient)

## Testing

### Install Test Package

```bash
# Test install (requires admin password)
sudo installer -pkg build/hq-1.0.0.pkg -target /

# Verify installation
ls -la ~/hq
claude --version
```

### Test on Clean Machine

For proper testing, use a clean macOS VM or a fresh user account:

1. Create new macOS VM or user
2. Copy the .pkg to the test environment
3. Run installer
4. Verify:
   - [ ] Installer UI displays correctly
   - [ ] Node.js is installed: `node --version`
   - [ ] Claude CLI is installed: `claude --version`
   - [ ] HQ files exist in `~/hq`
   - [ ] PATH is configured: `which claude`
   - [ ] `cd ~/hq && claude` works

### Test Scenarios

- [ ] Fresh macOS (no Node.js installed)
- [ ] macOS with old Node.js (< v18)
- [ ] macOS with current Node.js via Homebrew
- [ ] macOS with Node.js via nvm
- [ ] Upgrade from previous HQ version
- [ ] Desktop launcher works (hq.app)
- [ ] Terminal opens with Claude CLI

## Troubleshooting

### "The installer requires admin privileges"

The installer needs to run with admin rights to:
- Install Node.js system-wide
- Install npm packages globally
- Create `/etc/paths.d` entries

### Node.js Download Fails

Check internet connectivity. If behind a proxy, Node.js download may fail. Alternative: bundle Node.js in the package.

### Claude CLI Installation Fails

If npm install fails:
1. Check if npm is in PATH: `which npm`
2. Check for permission issues in npm global directory
3. Try manual install: `npm install -g @anthropic-ai/claude-code`

### PATH Not Updated

The installer adds entries to `~/.zshrc` and `~/.bash_profile`. If not working:
1. Open new Terminal window
2. Run `source ~/.zshrc`
3. Check if entries exist: `grep hq ~/.zshrc`

### Package Won't Open (Gatekeeper)

See CODE-SIGNING.md for signing and notarization instructions.

## Logs

Installation logs are written to:
```
/tmp/hq-installer.log
```

View logs:
```bash
cat /tmp/hq-installer.log
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Build macOS Installer

on:
  release:
    types: [created]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Installer
        run: |
          cd installer/macos
          chmod +x build-pkg.sh
          ./build-pkg.sh

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: macos-installer
          path: installer/macos/build/*.pkg
```

## Related Files

- `build-pkg.sh` - Main build script
- `CODE-SIGNING.md` - Signing and notarization
- `scripts/preinstall` - Dependency checking
- `scripts/postinstall` - Dependency installation and PATH setup
