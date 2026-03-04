# Video Gen — Pipeline Reference

Extended reference for the video-gen skill's three core tools.

## Chatterbox TTS (Local Voice Clone)

Uses a locally fine-tuned Chatterbox model for voiceover generation.
No API keys required — runs entirely on-device.

**Repo:** `~/repos/chatterbox-finetuning/`
**Full pipeline guide:** `production-house/knowledge/voice-cloning.md`
**Current voice clone:** `ship-it-code/knowledge/voice-clone.md`

### Generate Voiceover

1. Edit `inference.py`:

```python
TEXT_TO_SAY = (
    "First sentence of your script. "
    "Second sentence continues here. "
    "Keep sentences under 15 words for best results."
)
AUDIO_PROMPT = "./speaker_reference/narrator_ref.wav"
OUTPUT_FILE = "./out/voiceover.wav"
```

2. Run:

```bash
cd ~/repos/chatterbox-finetuning
python inference.py
```

Output: 24kHz mono WAV. The script handles sentence splitting, per-sentence
generation, VAD silence trimming, and concatenation with 200ms pauses.

### Parameters

Edit the `PARAMS` dict in `inference.py`:

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `temperature` | 0.8 | 0.1–1.5 | Higher = more variation, lower = more monotone |
| `exaggeration` | 0.5 | 0.0–1.0 | Controls emotional expressiveness |
| `cfg_weight` | 0.5 | 0.0–1.0 | Classifier-free guidance strength (Normal mode only) |
| `repetition_penalty` | 1.2 | 1.0–2.0 | Penalizes repeating the same token |

### Speaker Reference

The `AUDIO_PROMPT` wav determines voice characteristics. Requirements:
- 5-10 seconds of clean speech
- 24kHz mono WAV
- No background noise or music
- Representative of speaker's natural tone

Different reference clips produce subtly different voice qualities from the
same fine-tuned model.

### Long Script Strategy

Chatterbox handles sentence splitting automatically:
1. Text is split on `.?!` boundaries
2. Each sentence is generated independently
3. Silence is trimmed per sentence via Silero VAD
4. Sentences are concatenated with 200ms pauses

For very long scripts (multiple paragraphs), consider generating in batches
and concatenating with ffmpeg to avoid memory issues on MPS.

### Cloning a New Voice

See `production-house/knowledge/voice-cloning.md` for the complete pipeline:
download source audio → AssemblyAI transcription → speaker extraction →
dataset creation → preprocessing → fine-tuning → inference

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
