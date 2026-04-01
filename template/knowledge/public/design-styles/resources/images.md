---
type: reference
domain: [brand, engineering]
status: canonical
tags: [images, stock-photography, cdn, optimization, ai-generation]
relates_to: []
---

# Image Sources & Tools

Curated image resources — stock photography, AI generation, CDN delivery, optimization, and placeholder tooling.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| Unsplash | Stock photos | Free (Unsplash license) | Highest quality free photography | unsplash.com |
| Pexels | Stock photos/video | Free (Pexels license) | Strong alternative to Unsplash, video too | pexels.com |
| Midjourney | AI image gen | Paid (subscription) | Custom imagery, editorial illustrations, brand visuals | midjourney.com |
| DALL-E 3 | AI image gen | Paid (per token) | Integrated in ChatGPT, good text rendering | openai.com |
| Flux | AI image gen | Free/paid | High quality, open weights available | fal.ai/models/fal-ai/flux |
| Cloudinary | Image CDN | Freemium | Transform, optimize, deliver images from URL | cloudinary.com |
| Sharp | Node.js lib | MIT | Server-side image processing, resize/compress/convert | sharp.pixelplumbing.com |
| next/image | React component | MIT | Next.js built-in optimization, lazy loading, responsive | nextjs.org/docs/app/api-reference/components/image |
| Blurhash | Placeholder lib | MIT | Blurry color placeholder while image loads | blurha.sh |
| SQIP | Placeholder lib | MIT | SVG-based placeholder, more detail than Blurhash | github.com/nicolo-ribaudo/sqip |
| picsum.photos | Placeholder service | Free | Random real photos during development | picsum.photos |
| SVGR | SVG tool | MIT | Convert SVG files to React components | react-svgr.com |
| SVGO | SVG optimizer | MIT | Remove bloat from SVG exports | github.com/svg/svgo |

## Pairings

**Next.js projects**
- `next/image` for all `<img>` tags — automatic WebP/AVIF conversion, lazy loading, responsive sizes
- Cloudinary for user-uploaded images or assets requiring dynamic transforms (crop, resize on-demand)
- Blurhash or `placeholder="blur"` in next/image for smooth loading transitions
- Unsplash or Pexels for stock photography

**Static / marketing sites**
- Unsplash for hero images — download, compress locally with Sharp or Squoosh, serve from `/public`
- SVGO to optimize SVG exports from Figma before committing
- picsum.photos during development before sourcing final photography

**AI-generated brand imagery**
- Midjourney for editorial and lifestyle shots where stock photography lacks specificity
- Flux (via fal.ai) for programmatic generation or open-weight experimentation
- DALL-E 3 when text-on-image accuracy matters (logos embedded in images, diagrams)
- Always download at maximum resolution, optimize with Sharp for web delivery

**User-generated content pipeline**
- Cloudinary for upload, storage, and on-demand transforms
- Sharp for server-side validation and resizing before Cloudinary upload
- Blurhash generated server-side for loading placeholders

**SVG workflow**
- SVGR to convert SVG assets to React components — enables `className`, color props, accessibility attributes
- SVGO to strip Figma export cruft before SVGR conversion
- Iconify for production SVG sprite delivery (see icons.md)

## Anti-Recommendations

- **iStockPhoto / Getty Images**: Expensive licensing relative to quality differential over Unsplash/Pexels. Reserve for genuinely unique imagery that cannot be sourced free.
- **Generic stock photo aesthetic**: People in boardrooms shaking hands, overhead laptop flatlays, diverse team stock smiles. These images actively harm trust. Use real photography or AI-generated imagery with a specific art direction.
- **Unoptimized PNG uploads**: Raw Figma exports, screenshots, and uncompressed photography blow up page weight. Always compress before serving.
- **Base64 inlining for large images**: Inline base64 prevents browser caching and bloats HTML. Use Blurhash for placeholders instead.
- **Hotlinking Unsplash directly in production**: Unsplash allows it but their CDN is not guaranteed for production traffic. Download, optimize, and serve from your own CDN.

## Worker Integration

**next/image (recommended for Next.js)**
```tsx
import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Product hero"
  width={1200}
  height={630}
  priority          // above fold: loads eagerly, no lazy
  placeholder="blur"
  blurDataURL={blurhash}
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

**Sharp — resize and convert to WebP**
```bash
npm install sharp
```
```ts
import sharp from 'sharp'

await sharp('input.jpg')
  .resize(1200, 630, { fit: 'cover' })
  .webp({ quality: 80 })
  .toFile('output.webp')

// Generate responsive variants
for (const width of [400, 800, 1200]) {
  await sharp('input.jpg')
    .resize(width)
    .webp({ quality: 80 })
    .toFile(`output-${width}.webp`)
}
```

**Cloudinary — URL-based transforms**
```
// Original
https://res.cloudinary.com/{cloud_name}/image/upload/v1/{public_id}.jpg

// Resize + WebP + quality auto
https://res.cloudinary.com/{cloud_name}/image/upload/w_800,q_auto,f_webp/v1/{public_id}

// Crop to face
https://res.cloudinary.com/{cloud_name}/image/upload/w_400,h_400,c_thumb,g_face/v1/{public_id}
```

**Blurhash — generate server-side**
```bash
npm install blurhash sharp
```
```ts
import { encode } from 'blurhash'
import sharp from 'sharp'

async function getBlurHash(imagePath: string): Promise<string> {
  const { data, info } = await sharp(imagePath)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4)
}
```

**SVGR — SVG to React component**
```bash
npm install -D @svgr/cli
npx @svgr/cli --out-dir src/icons src/assets/svg
```
```tsx
// Generated component
import LogoIcon from './icons/Logo'
<LogoIcon className="text-primary" width={24} height={24} aria-hidden="true" />
```

**SVGO — optimize SVG**
```bash
npm install -D svgo
npx svgo input.svg -o output.svg
# Or batch
npx svgo -f ./src/icons -o ./src/icons/optimized
```

**picsum.photos during development**
```tsx
// Random 800×400 image
<img src="https://picsum.photos/800/400" alt="" />

// Consistent seed (same image every time)
<img src="https://picsum.photos/seed/product-hero/800/400" alt="" />

// Specific photo by ID
<img src="https://picsum.photos/id/10/800/400" alt="" />
```

**Format priority for web delivery**
1. AVIF — best compression, growing support (Chrome, Firefox, Safari 16+)
2. WebP — universal support, 25–35% smaller than JPEG at same quality
3. JPEG — fallback for older browsers
4. PNG — only for transparency requirements (logos, icons with alpha)

**Responsive srcset pattern**
```html
<img
  srcset="
    /image-400.webp 400w,
    /image-800.webp 800w,
    /image-1200.webp 1200w
  "
  sizes="(max-width: 768px) 100vw, 50vw"
  src="/image-800.webp"
  alt="Description"
  loading="lazy"
  decoding="async"
/>
```
