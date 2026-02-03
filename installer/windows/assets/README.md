# Installer Assets

This directory contains visual assets for the HQ Windows installer.

## Required Files

Before building the installer, create the following files:

### Icons
- `hq-icon.ico` - Main application icon (256x256, multi-resolution ICO)
- `hq-uninstall.ico` - Uninstaller icon (256x256, multi-resolution ICO)

### Banners (BMP format, required by NSIS)
- `welcome-banner.bmp` - Welcome page left banner (164x314 pixels)
- `header.bmp` - Page header banner (150x57 pixels)

## Creating Assets

### Quick Start (Placeholder icons)
For testing, you can use simple placeholder icons. Here's how to create them:

1. Create a 256x256 PNG with your logo
2. Convert to ICO using online tools like:
   - https://convertio.co/png-ico/
   - https://icoconvert.com/

### Banner Specifications

**Welcome Banner (164x314 pixels):**
- Left side of welcome/finish pages
- Should contain logo and branding
- Use BMP format (24-bit)

**Header Banner (150x57 pixels):**
- Top right of installation pages
- Smaller version of logo
- Use BMP format (24-bit)

### Converting Images to BMP

Using ImageMagick:
```bash
convert logo.png -resize 164x314 -gravity center -extent 164x314 welcome-banner.bmp
convert logo.png -resize 150x57 -gravity center -extent 150x57 header.bmp
```

Using GIMP:
1. Open image
2. Image > Scale Image to correct dimensions
3. File > Export As > .bmp
4. Select "24 bit" color depth

## Testing Without Assets

If you want to test the installer before creating final assets, you can:

1. Comment out the icon/banner lines in `hq-installer.nsi`
2. Or create placeholder BMPs and ICOs using simple colors

The installer will use default Windows icons if custom assets are not found.
