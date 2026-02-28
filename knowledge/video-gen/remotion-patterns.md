# Video Gen — Remotion Patterns

Patterns derived from `scratch/code-typing-video/` and Remotion best practices.

## Project Structure

```
{project}/
  package.json
  src/
    index.js            # Entry point: registerRoot
    Root.jsx            # Composition declarations
    {Scene}.jsx         # Scene components
```

### package.json Dependencies

```json
{
  "type": "module",
  "dependencies": {
    "remotion": "^4.0.429",
    "@remotion/cli": "^4.0.429",
    "@remotion/bundler": "^4.0.429",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  }
}
```

### Entry Point (`src/index.js`)

```jsx
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.jsx";
registerRoot(RemotionRoot);
```

### Composition Declaration (`src/Root.jsx`)

```jsx
import { Composition } from "remotion";
import { MyScene } from "./MyScene.jsx";

export const RemotionRoot = () => (
  <Composition
    id="MyScene"
    component={MyScene}
    durationInFrames={300}   // 10 seconds at 30fps
    fps={30}
    width={1920}             // 1080p
    height={1080}
  />
);
```

Common resolutions:
- 4K: `width={3840} height={2160}`
- 1080p: `width={1920} height={1080}`
- 720p: `width={1280} height={720}`
- Square (social): `width={1080} height={1080}`
- Vertical (shorts): `width={1080} height={1920}`

## Scene Component Pattern

```jsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export const MyScene = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scale = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ backgroundColor: "#1e1e1e" }}>
      <div style={{ opacity, transform: `scale(${scale})` }}>
        {title}
      </div>
    </AbsoluteFill>
  );
};
```

### Key APIs

| API | Purpose |
|-----|---------|
| `useCurrentFrame()` | Current frame number (0-based) |
| `useVideoConfig()` | `{ fps, width, height, durationInFrames }` |
| `interpolate(frame, inputRange, outputRange, options)` | Map frame to value |
| `spring({ frame, fps, config })` | Physics-based animation |
| `AbsoluteFill` | Full-frame container (position: absolute, inset: 0) |

### interpolate Options

```jsx
interpolate(frame, [0, 30], [0, 1], {
  extrapolateLeft: "clamp",   // "clamp" | "extend" | "identity"
  extrapolateRight: "clamp",
  easing: Easing.inOut(Easing.ease),
});
```

### spring Config

```jsx
spring({
  frame,
  fps,
  config: {
    damping: 200,      // Higher = less bouncy
    mass: 1,
    stiffness: 100,
    overshootClamping: false,
  },
});
```

## Multi-Scene Compositions

### Using Sequence

```jsx
import { Sequence } from "remotion";

export const MultiScene = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={90}>
      <TitleSlide title="Introduction" />
    </Sequence>
    <Sequence from={90} durationInFrames={150}>
      <CodeDemo code={myCode} />
    </Sequence>
    <Sequence from={240} durationInFrames={60}>
      <OutroSlide />
    </Sequence>
  </AbsoluteFill>
);
```

Inside each `<Sequence>`, `useCurrentFrame()` resets to 0.

### Using Series

```jsx
import { Series } from "remotion";

export const MultiScene = () => (
  <Series>
    <Series.Sequence durationInFrames={90}>
      <TitleSlide />
    </Series.Sequence>
    <Series.Sequence durationInFrames={150}>
      <CodeDemo />
    </Series.Sequence>
    <Series.Sequence durationInFrames={60}>
      <OutroSlide />
    </Series.Sequence>
  </Series>
);
```

`<Series>` auto-calculates `from` offsets — no manual math needed.

## Parameterized Compositions

Pass data at render time via input props:

```jsx
// Root.jsx
<Composition
  id="DynamicVideo"
  component={DynamicVideo}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{
    title: "Default Title",
    codeLines: [],
  }}
/>
```

Render with custom props:
```bash
npx remotion render src/index.js DynamicVideo out/video.mp4 \
  --props '{"title":"Custom Title","codeLines":["const x = 1;"]}'
```

## Code Typing Animation Pattern

From `scratch/code-typing-video/CodeTyping.jsx`:

1. Define `CODE_LINES` array and `CHARS_PER_SECOND` rate
2. Calculate `charsToShow = Math.floor((frame / fps) * CHARS_PER_SECOND)`
3. Build `visibleLines` by slicing code lines to char count
4. Render with syntax highlighting and blinking cursor
5. Use VS Code dark theme colors (`#1e1e1e` background, `#d4d4d4` text)
