# macOS Installer Assets

This directory contains image assets for the macOS installer.

## Required Assets

### background.png
- **Size**: 620 x 418 pixels (standard installer size)
- **Format**: PNG
- **Location**: Displayed on the left side of installer window
- **Design notes**: Use transparent or solid background that complements the welcome text

### icon.icns
- **Format**: macOS icon file (.icns)
- **Sizes included**: 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024
- **Purpose**: Application/product icon

## Creating Assets

### From PNG to ICNS

```bash
# Install iconutil (comes with Xcode)
# Create iconset directory structure
mkdir hq.iconset
sips -z 16 16     icon-1024.png --out hq.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out hq.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out hq.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out hq.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out hq.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out hq.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out hq.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out hq.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out hq.iconset/icon_512x512.png
sips -z 1024 1024 icon-1024.png --out hq.iconset/icon_512x512@2x.png

# Convert to .icns
iconutil -c icns hq.iconset
```

### Background Image Guidelines

- Keep important content in the center
- Use the purple/indigo color scheme (gradient #667eea to #764ba2)
- Avoid text in the image (installer pages have their own text)
- Consider light patterns or abstract shapes

## Placeholder Assets

If assets don't exist, the installer will use macOS defaults:
- No custom background (plain white)
- Generic package icon

Create placeholders for testing:

```bash
# Create placeholder background (requires ImageMagick)
convert -size 620x418 gradient:#667eea-#764ba2 background.png

# Or create simple colored rectangle
convert -size 620x418 xc:#764ba2 background.png
```

## Asset Locations

In `resources/` directory:
- `background.png` - Referenced by `distribution.xml`
- HTML files reference CSS colors directly (no external images needed for basic branding)
