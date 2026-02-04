# Code Signing and Notarizing the HQ macOS Installer

This guide explains how to sign and notarize the macOS installer for distribution outside the Mac App Store.

## Why Sign and Notarize?

### Without Signing
Users will see Gatekeeper warnings:
- "hq-1.0.0.pkg can't be opened because Apple cannot check it for malicious software"
- Users must right-click → Open to bypass

### With Signing (Not Notarized)
- "hq-1.0.0.pkg can't be opened because it was not downloaded from the App Store"
- Can be bypassed via System Preferences → Security

### With Signing AND Notarization
- No warnings! Package opens normally
- Apple has verified the package is safe
- Best user experience

## Certificate Requirements

You need an **Apple Developer ID Installer certificate**:

1. Enroll in Apple Developer Program ($99/year): https://developer.apple.com/programs/
2. Create a Developer ID Installer certificate:
   - Open Keychain Access
   - Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority
   - Go to developer.apple.com → Certificates, Identifiers & Profiles
   - Create new certificate → Developer ID Installer

### Certificate Types

| Certificate Type | Use Case |
|-----------------|----------|
| Developer ID Installer | Signing .pkg installers (this one) |
| Developer ID Application | Signing .app bundles |
| Apple Distribution | Mac App Store distribution |

## Signing the Installer

### Find Your Signing Identity

```bash
# List all signing identities
security find-identity -p basic -v

# Look for "Developer ID Installer: Your Name (TEAM_ID)"
```

### Sign During Build

```bash
./build-pkg.sh "Developer ID Installer: Your Name (TEAM_ID)"
```

### Sign Existing Package

```bash
productsign \
    --sign "Developer ID Installer: Your Name (TEAM_ID)" \
    hq-1.0.0.pkg \
    hq-1.0.0-signed.pkg
```

### Verify Signature

```bash
pkgutil --check-signature hq-1.0.0-signed.pkg
```

Expected output:
```
Package "hq-1.0.0-signed.pkg":
   Status: signed by a developer certificate issued by Apple for distribution
   Signed with a trusted timestamp on: [date]
   Certificate Chain:
    1. Developer ID Installer: Your Name (TEAM_ID)
    2. Developer ID Certification Authority
    3. Apple Root CA
```

## Notarization

Apple's notarization service scans your package for malware and issues a ticket.

### Prerequisites

1. **App-Specific Password**: Generate at https://appleid.apple.com/account/manage
2. **Team ID**: Found in Apple Developer account or in certificate name

### Notarize the Package

```bash
# Submit for notarization
xcrun notarytool submit hq-1.0.0-signed.pkg \
    --apple-id "your@email.com" \
    --team-id "TEAM_ID" \
    --password "app-specific-password" \
    --wait

# Alternative: use keychain profile (recommended)
xcrun notarytool store-credentials "notary-profile" \
    --apple-id "your@email.com" \
    --team-id "TEAM_ID" \
    --password "app-specific-password"

xcrun notarytool submit hq-1.0.0-signed.pkg \
    --keychain-profile "notary-profile" \
    --wait
```

### Check Notarization Status

```bash
xcrun notarytool history --keychain-profile "notary-profile"

# Get details of a specific submission
xcrun notarytool log SUBMISSION_ID --keychain-profile "notary-profile"
```

### Staple the Ticket

After notarization succeeds, staple the ticket to the package:

```bash
xcrun stapler staple hq-1.0.0-signed.pkg
```

This embeds the notarization ticket so users can verify offline.

### Verify Notarization

```bash
xcrun stapler validate hq-1.0.0-signed.pkg
spctl --assess -vvv --type install hq-1.0.0-signed.pkg
```

## Complete Workflow

```bash
#!/bin/bash
# build-sign-notarize.sh

set -e

VERSION="1.0.0"
SIGNING_ID="Developer ID Installer: Your Name (TEAM_ID)"
NOTARY_PROFILE="notary-profile"

echo "Building installer..."
./build-pkg.sh "$SIGNING_ID"

PKG="build/hq-${VERSION}.pkg"

echo "Submitting for notarization..."
xcrun notarytool submit "$PKG" \
    --keychain-profile "$NOTARY_PROFILE" \
    --wait

echo "Stapling ticket..."
xcrun stapler staple "$PKG"

echo "Verifying..."
xcrun stapler validate "$PKG"
spctl --assess -vvv --type install "$PKG"

echo "Done! Package ready for distribution: $PKG"
```

## GitHub Actions Workflow

```yaml
name: Build and Notarize macOS Installer

on:
  release:
    types: [created]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Import Certificate
        env:
          CERTIFICATE_BASE64: ${{ secrets.MACOS_CERTIFICATE_BASE64 }}
          CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
        run: |
          # Create keychain
          security create-keychain -p "" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "" build.keychain

          # Import certificate
          echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
          security import certificate.p12 -k build.keychain -P "$CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/productsign
          security set-key-partition-list -S apple-tool:,apple:,productsign: -s -k "" build.keychain

          rm certificate.p12

      - name: Build and Sign
        env:
          SIGNING_IDENTITY: ${{ secrets.MACOS_SIGNING_IDENTITY }}
        run: |
          cd installer/macos
          chmod +x build-pkg.sh
          ./build-pkg.sh "$SIGNING_IDENTITY"

      - name: Notarize
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
        run: |
          xcrun notarytool submit installer/macos/build/*.pkg \
            --apple-id "$APPLE_ID" \
            --team-id "$TEAM_ID" \
            --password "$APP_PASSWORD" \
            --wait

          xcrun stapler staple installer/macos/build/*.pkg

      - name: Upload Release Asset
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: installer/macos/build/hq-1.0.0.pkg
          asset_name: hq-1.0.0.pkg
          asset_content_type: application/octet-stream
```

## Troubleshooting

### "The signature is invalid"

- Ensure you're using "Developer ID Installer" (not Application)
- Check certificate hasn't expired
- Verify with: `security find-identity -v`

### Notarization Fails

Common issues:
1. **Hardened Runtime**: Not required for installers
2. **Timestamp**: Signing should include timestamp (default behavior)
3. **Network issues**: Try again

Get detailed error log:
```bash
xcrun notarytool log SUBMISSION_ID --keychain-profile "notary-profile"
```

### "Package was not signed with a trusted timestamp"

Signing must include timestamp. This is default with `productsign`, but verify:
```bash
pkgutil --check-signature package.pkg | grep timestamp
```

### Certificate Not Found

1. Open Keychain Access
2. Check "login" and "System" keychains
3. Verify certificate is valid (not expired)
4. Try: `security find-identity -p basic -v`

## Cost Summary

| Item | Cost | Notes |
|------|------|-------|
| Apple Developer Program | $99/year | Required for signing |
| Code Signing Certificate | Free | Included with Developer Program |
| Notarization | Free | Included with Developer Program |

## Handling Gatekeeper for Unsigned Packages

If you cannot sign, users can install unsigned packages by:

1. **Right-click method**: Right-click .pkg → Open → Open (in dialog)
2. **System Preferences**: System Preferences → Security & Privacy → "Open Anyway"
3. **Terminal**: `sudo xattr -rd com.apple.quarantine hq.pkg`

Document this in your download page for users.
