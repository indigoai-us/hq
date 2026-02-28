# Video Gen — Pipeline Reference

Extended reference for the video-gen skill's three core tools.

## ElevenLabs TTS API

The `@elevenlabs/cli` is for managing conversational agents, not TTS.
Use the REST API via curl for speech generation.

### Text-to-Speech

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

Headers:
- `xi-api-key: $ELEVENLABS_API_KEY`
- `Content-Type: application/json`

Body:
```json
{
  "text": "...",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

Response: binary audio (`application/octet-stream`). Pipe to `--output file.mp3`.

### Query Parameters

| Param | Description |
|-------|-------------|
| `output_format` | `mp3_44100_128` (default), `mp3_22050_32`, `pcm_16000`, `pcm_24000`, `ulaw_8000` |
| `optimize_streaming_latency` | 0-4 (0=disabled, 4=max optimization) |

### Models

| Model ID | Notes |
|----------|-------|
| `eleven_multilingual_v2` | Best quality, 29 languages |
| `eleven_turbo_v2` | Low latency, English-optimized |
| `eleven_turbo_v2_5` | Low latency, multilingual |

### Voice Settings Ranges

| Setting | Range | Default | Effect |
|---------|-------|---------|--------|
| `stability` | 0.0–1.0 | 0.5 | Higher = more consistent, lower = more expressive |
| `similarity_boost` | 0.0–1.0 | 0.75 | Higher = closer to original voice |
| `style` | 0.0–1.0 | 0.0 | Higher = more expressive (increases latency) |
| `speed` | 0.7–1.2 | 1.0 | Speech speed multiplier |

### List Voices

```bash
curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
  "https://api.elevenlabs.io/v1/voices" | jq '.voices[] | {voice_id, name}'
```

### Streaming Variant

For long-form content, use the streaming endpoint:

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream
```

Same body. Response is chunked audio — pipe directly to file.

### Long Script Strategy

For scripts > 5000 chars, split into sections and generate per-section:
1. Split script at natural paragraph breaks
2. Generate audio per section
3. Concatenate with ffmpeg (see below)
4. Use `previous_request_ids` for voice continuity across chunks

---

## Remotion CLI

### Render

```bash
npx remotion render <entry-file> <composition-id> <output> [flags]
```

| Flag | Description |
|------|-------------|
| `--codec` | `h264` (default), `h265`, `vp8`, `vp9`, `prores`, `gif` |
| `--image-format` | `jpeg` (faster) or `png` (transparency) |
| `--concurrency` | Parallel frames (default: 50% of CPU cores) |
| `--scale` | Output scale multiplier (e.g., 0.5 for half-size preview) |
| `--props` | JSON string of input props: `--props '{"text":"hello"}'` |
| `--log` | Log level: `verbose`, `info`, `warn`, `error` |
| `--crf` | Quality (0-51, lower=better, default varies by codec) |
| `--every-nth-frame` | Skip frames (useful for GIF) |

### Preview (development)

```bash
npx remotion preview src/index.js
```

Opens browser at `localhost:3000` with timeline scrubber.

### List Compositions

```bash
npx remotion compositions src/index.js
```

Shows all registered compositions with their dimensions, fps, and duration.

### Input Props

Pass dynamic data to compositions:

```bash
npx remotion render src/index.js MyComp out/video.mp4 \
  --props '{"title":"Hello World","codeLines":["const x = 1;"]}'
```

In the component:
```jsx
export const MyComp = ({ title, codeLines }) => { ... }
```

---

## ffmpeg Recipe Cookbook

### Probe Media Info

```bash
# Duration in seconds
ffprobe -v error -show_entries format=duration -of csv=p=0 input.mp3

# Full format info
ffprobe -v error -show_format -show_streams input.mp4
```

### Concatenate Audio Files

```bash
# Create filelist.txt:
#   file 'section1.mp3'
#   file 'section2.mp3'
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp3
```

### Trim Audio/Video

```bash
# Trim from 00:00:05 for 10 seconds
ffmpeg -i input.mp4 -ss 00:00:05 -t 10 -c copy output.mp4
```

### Fade In/Out

```bash
# Audio fade: 2s fade-in, 3s fade-out (for 60s file)
ffmpeg -i input.mp3 -af "afade=t=in:st=0:d=2,afade=t=out:st=57:d=3" output.mp3

# Video fade: 1s fade-in, 1s fade-out (30fps, 300 frames)
ffmpeg -i input.mp4 -vf "fade=in:0:30,fade=out:270:30" output.mp4
```

### Adjust Audio Volume

```bash
# Reduce to 50%
ffmpeg -i input.mp3 -af "volume=0.5" output.mp3
```

### Mix Background Music with Voiceover

```bash
ffmpeg -i voiceover.mp3 -i bgmusic.mp3 \
  -filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first" \
  -c:a aac -b:a 192k output.mp3
```

### Text Overlay

```bash
ffmpeg -i input.mp4 \
  -vf "drawtext=text='Hello World':fontsize=48:fontcolor=white:x=(w-tw)/2:y=h-100" \
  output.mp4
```

### Extract Thumbnail

```bash
# Frame at 5 seconds
ffmpeg -i input.mp4 -ss 00:00:05 -vframes 1 thumbnail.png

# Best frame from first 10 seconds
ffmpeg -i input.mp4 -vf "select=gt(scene\,0.3)" -frames:v 1 -vsync vfr thumbnail.png
```

### Create GIF from Video

```bash
ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1:flags=lanczos" \
  -c:v gif output.gif
```
