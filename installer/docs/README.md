# my-hq Download Landing Page

This folder contains the download landing page for my-hq, designed to be hosted on GitHub Pages.

## Deploying to GitHub Pages

### Option 1: Deploy from `/docs` folder (Recommended)

1. Go to your repository Settings > Pages
2. Under "Source", select "Deploy from a branch"
3. Select `main` branch and `/docs` folder
4. Click Save

The page will be available at `https://yourusername.github.io/my-hq/`

### Option 2: Deploy from root with GitHub Actions

If you want the docs in a separate branch or custom workflow, you can copy this folder's contents to the root of a `gh-pages` branch.

## Customization

### Update Download URLs

Edit `index.html` and update the `releaseBase` variable in the JavaScript section:

```javascript
const releaseBase = 'https://github.com/yourusername/my-hq/releases/latest/download/';
```

### Update Version Number

Search for `1.0.0` in `index.html` and update all occurrences to match your release version.

### Branding

The color scheme uses CSS variables in `:root`. Adjust these to match your brand:

```css
:root {
    --primary: #6366f1;      /* Main accent color */
    --primary-dark: #4f46e5; /* Darker accent */
    --bg: #0f0f23;           /* Page background */
    ...
}
```

## Files

- `index.html` - Main landing page with:
  - OS auto-detection
  - Download buttons for Windows/macOS
  - System requirements
  - Manual installation instructions
  - FAQ section
- `_config.yml` - Jekyll configuration (minimal)
- `.nojekyll` - Tells GitHub Pages to skip Jekyll processing

## Testing Locally

Open `index.html` directly in your browser, or use a local server:

```bash
# Python 3
python -m http.server 8000

# Node.js (npx)
npx serve .
```

Then open `http://localhost:8000`

## Features

- **OS Detection**: Automatically detects Windows/macOS and shows the appropriate download button
- **Responsive**: Works on mobile devices
- **Dark Theme**: Modern dark UI that matches my-hq branding
- **No Dependencies**: Pure HTML/CSS/JS, no build step required
- **GitHub Pages Ready**: Works out of the box with GitHub Pages
