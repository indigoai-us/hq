# Code Signing the my-hq Windows Installer

This guide explains how to sign the my-hq installer to prevent Windows SmartScreen warnings.

## Why Sign?

Unsigned installers trigger Windows SmartScreen warnings like:
- "Windows protected your PC"
- "Unknown publisher"

Signing builds user trust and prevents security warnings.

## Certificate Options

### Option 1: EV Code Signing Certificate (Recommended)

**Best for:** Production releases, public distribution

**Benefits:**
- Immediate SmartScreen reputation (no warning period)
- Hardware token requirement adds security
- Professional appearance

**Providers:**
- DigiCert: ~$500/year
- Sectigo (Comodo): ~$400/year
- GlobalSign: ~$400/year

**Process:**
1. Purchase certificate from provider
2. Complete identity verification (requires business docs)
3. Receive USB hardware token with certificate
4. Sign using Windows SDK tools

### Option 2: Standard Code Signing Certificate

**Best for:** Smaller projects, initial releases

**Benefits:**
- Cheaper than EV (~$200/year)
- No hardware token required

**Drawbacks:**
- Must build SmartScreen reputation over time
- Initial downloads may still trigger warnings

**Providers:**
- Certum: ~$50/year (individual)
- SSL.com: ~$200/year
- Sectigo: ~$200/year

### Option 3: Self-Signed Certificate (Development Only)

**Best for:** Testing the signing process

**Drawbacks:**
- Will ALWAYS trigger SmartScreen warning
- Not suitable for distribution

## Signing Process

### Prerequisites

1. **Windows SDK** - Includes `signtool.exe`
   ```
   C:\Program Files (x86)\Windows Kits\10\bin\10.x.xxxxx.x\x64\signtool.exe
   ```

2. **Code Signing Certificate** (.pfx file or hardware token)

### Signing with Certificate File (.pfx)

```cmd
signtool sign /f "certificate.pfx" /p "password" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /d "my-hq Installer" my-hq-setup-1.0.0.exe
```

**Parameters:**
- `/f` - Path to .pfx certificate file
- `/p` - Password for .pfx file
- `/fd SHA256` - File digest algorithm
- `/tr` - Timestamp server URL (important!)
- `/td SHA256` - Timestamp digest algorithm
- `/d` - Description shown in UAC prompt

### Signing with Hardware Token (EV Certificate)

```cmd
signtool sign /sha1 "THUMBPRINT" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /d "my-hq Installer" my-hq-setup-1.0.0.exe
```

**Finding your certificate thumbprint:**
```powershell
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*your-company*" }
```

### Timestamp Servers

Always use timestamping! Without it, signatures expire when the certificate expires.

**Recommended servers:**
- http://timestamp.digicert.com
- http://timestamp.sectigo.com
- http://timestamp.globalsign.com/tsa/r6advanced1
- http://rfc3161timestamp.globalsign.com/advanced

### Verifying the Signature

```cmd
signtool verify /pa /v my-hq-setup-1.0.0.exe
```

Or right-click the .exe > Properties > Digital Signatures tab

## Automation

### Build Script with Signing

Create `build-and-sign.ps1`:

```powershell
# Configuration
$NsisPath = "C:\Program Files (x86)\NSIS\makensis.exe"
$SignToolPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe"
$CertPath = "path\to\certificate.pfx"
$CertPassword = $env:CODE_SIGN_PASSWORD  # From environment variable
$TimestampUrl = "http://timestamp.digicert.com"

# Build
Write-Host "Building installer..."
& $NsisPath "hq-installer.nsi"

# Sign
Write-Host "Signing installer..."
& $SignToolPath sign /f $CertPath /p $CertPassword /fd SHA256 /tr $TimestampUrl /td SHA256 /d "my-hq Installer" "my-hq-setup-1.0.0.exe"

# Verify
Write-Host "Verifying signature..."
& $SignToolPath verify /pa "my-hq-setup-1.0.0.exe"

Write-Host "Done!"
```

### GitHub Actions Example

```yaml
name: Build Windows Installer

on:
  release:
    types: [created]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install NSIS
        run: choco install nsis -y

      - name: Build Installer
        run: makensis installer/windows/hq-installer.nsi

      - name: Sign Installer
        env:
          CERT_PASSWORD: ${{ secrets.CODE_SIGN_PASSWORD }}
        run: |
          # Decode certificate from base64 secret
          echo "${{ secrets.CODE_SIGN_CERT_BASE64 }}" | base64 -d > cert.pfx

          # Sign
          signtool sign /f cert.pfx /p "$env:CERT_PASSWORD" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /d "my-hq Installer" my-hq-setup-*.exe

          # Clean up
          Remove-Item cert.pfx

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: my-hq-setup-*.exe
```

## Troubleshooting

### "No certificates were found" Error

- Ensure certificate is installed in Windows Certificate Store
- For .pfx files, double-click to import first
- Check certificate hasn't expired

### SmartScreen Still Showing Warnings

- EV certificates have immediate reputation
- Standard certificates need downloads to build reputation
- Ensure timestamp was applied (check signature details)

### "The signature is invalid" Error

- File may have been modified after signing
- Re-sign the file
- Ensure correct timestamp server was used

## Cost Summary

| Option | Annual Cost | SmartScreen Reputation |
|--------|-------------|----------------------|
| EV Certificate | $400-500 | Immediate |
| Standard Certificate | $50-200 | Builds over time |
| Self-Signed | Free | Never (always warns) |

## Recommended Approach

1. **For development/testing:** Use unsigned or self-signed
2. **For initial release:** Standard certificate (Certum is cheapest)
3. **For production:** EV certificate (best user experience)
