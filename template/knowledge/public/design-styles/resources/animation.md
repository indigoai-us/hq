---
type: reference
domain: [engineering, brand]
status: canonical
tags: [animation, motion, libraries, micro-interactions, scroll-driven]
relates_to: []
---

# Motion Libraries

Curated animation library recommendations — from drop-in micro-interactions to complex scroll-driven timelines.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| Framer Motion | React animation | MIT | Default for React — spring physics, layout animations, exit animations | motion.dev |
| Motion One | Vanilla JS animation | MIT | Framework-agnostic, lightweight, Web Animations API wrapper | motion.dev/docs/quick-start |
| GSAP | JS animation engine | Custom (free for most) | Complex timelines, scroll-driven sequences, SVG morphing | gsap.com |
| Lenis | Smooth scroll | MIT | Smooth scroll — pairs with any animation library | lenis.darkroom.engineering |
| Auto-animate | Drop-in animations | MIT | Automatic list/transition animations with zero config | auto-animate.formkit.com |
| CSS `@starting-style` | Native CSS | Free (browser) | Entrance animations without JS — modern browsers | MDN |
| View Transition API | Native browser | Free (browser) | Page transitions and element morphing — native, no lib needed | MDN |
| CSS scroll-timeline | Native CSS | Free (browser) | Scroll-driven animations, no JS required | MDN |

## Pairings

**React / Next.js app**
- Framer Motion for component animations (page transitions, modals, drawers, list reorders)
- Lenis for smooth scrolling on marketing pages
- Auto-animate for list mutations (adding/removing items) — zero config

**Marketing site with scroll effects**
- GSAP + ScrollTrigger for complex scroll sequences (parallax, pinning, staggered reveals)
- Lenis for buttery scroll feel — configure Lenis then feed its `raf` to GSAP's ticker
- Framer Motion for React component entrance animations alongside GSAP for timeline work

**Landing page (React)**
- Framer Motion `whileInView` for scroll-triggered entrance animations
- `AnimatePresence` for tab/section transitions
- For simple cases: CSS `@starting-style` + `transition` — no library needed

**Framework-agnostic or vanilla**
- Motion One for programmatic animations without framework coupling
- GSAP where Motion One's feature set is insufficient (complex timelines, morphing)
- Lenis always — it's framework-agnostic and pairs with everything

**Native-first approach (modern browsers, reducing JS)**
- CSS `@starting-style` for entrance animations
- View Transition API for page-level transitions (supported in Chrome 111+, spreading)
- `scroll-timeline` + `animation-timeline` for scroll-driven effects
- Fallback: Framer Motion for browsers without native support

## Anti-Recommendations

- **Anime.js**: Largely unmaintained since 2021. Motion One is its spiritual successor with better browser alignment.
- **React Spring**: Was the main Framer Motion competitor 2019–2021. Now lags significantly in features, documentation quality, and community. Use Framer Motion.
- **Velocity.js**: Old jQuery-era library. Irrelevant on modern stacks.
- **AOS (Animate on Scroll)**: Works but crude — CSS class toggling. Framer Motion's `whileInView` is cleaner and more composable.
- **WOW.js**: Same issue as AOS. Dead project.
- **Three.js directly for 2D animations**: Overkill. Use Three.js for 3D; use Framer/GSAP for 2D.

## Worker Integration

**Framer Motion — entrance animations**
```bash
npm install framer-motion
```
```tsx
import { motion } from 'framer-motion'

// Fade + slide up on mount
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: 'easeOut' }}
>

// Scroll-triggered
<motion.div
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: '-80px' }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
>
```

**Framer Motion — exit animations with AnimatePresence**
```tsx
import { AnimatePresence, motion } from 'framer-motion'

<AnimatePresence>
  {isOpen && (
    <motion.div
      key="modal"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    />
  )}
</AnimatePresence>
```

**Framer Motion — layout animations (list reorder)**
```tsx
// Add layoutId for shared element transitions, layout for auto-animate
<motion.li layout key={item.id}>
  {item.name}
</motion.li>
```

**GSAP + ScrollTrigger (CDN)**
```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
```
```js
gsap.registerPlugin(ScrollTrigger)

gsap.from('.hero-text', {
  scrollTrigger: { trigger: '.hero-text', start: 'top 80%' },
  opacity: 0,
  y: 40,
  duration: 0.8,
  stagger: 0.1,
  ease: 'power3.out'
})
```

**Lenis smooth scroll setup**
```bash
npm install @studio-freight/lenis
```
```js
import Lenis from '@studio-freight/lenis'

const lenis = new Lenis({ lerp: 0.1, smooth: true })

function raf(time) {
  lenis.raf(time)
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)
```

**Auto-animate (zero config)**
```bash
npm install @formkit/auto-animate
```
```tsx
import { useAutoAnimate } from '@formkit/auto-animate/react'

function List() {
  const [parent] = useAutoAnimate()
  return <ul ref={parent}>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
}
```

**CSS @starting-style (native, no JS)**
```css
/* Fade in on element entering DOM — no JS needed */
.dialog {
  opacity: 1;
  transition: opacity 0.3s ease;
}

@starting-style {
  .dialog { opacity: 0; }
}
```

**GSAP license note**: GSAP core and most plugins are free (no-charge license). ScrollTrigger is free for non-commercial projects. For commercial use, verify at gsap.com/licensing — a Club GSAP membership unlocks all plugins commercially.

**Performance rule**: Animate only `transform` and `opacity` for 60fps. Animating `width`, `height`, `top`, `left` triggers layout reflow. Use `translateX/Y` and `scaleX/Y` instead.
