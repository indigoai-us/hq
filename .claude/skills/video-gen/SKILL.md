---
name: Video Generator
description: "Video production: script to voiceover, Remotion render, and ffmpeg post-processing"
---

# Video Generator

End-to-end video production pipeline. Writes a script, generates voiceover
audio in small chunks, renders matching Remotion video chunks sized to each
audio chunk, and assembles the final video.

## Pipeline

```
1. Script     -> structured chunks (1-2 sentences each, with visual cues)
2. TTS        -> Chatterbox generates one .wav per chunk (small = fewer errors)
2b. Denoise   -> Demucs isolates vocals, removing TTS artifacts and background noise
2c. Verify    -> Whisper transcribes each chunk, flags mismatches against script
3. Video      -> Remotion renders one silent .mp4 per chunk (duration = audio length)
4. Assembly   -> ffmpeg merges each audio+video pair, concatenates all, encodes final
```

**Key principle:** Audio drives video length. Each video chunk's
`durationInFrames` is calculated from its audio chunk's duration.
Never speed up or slow down audio — it degrades voice quality.

## Step 1: Write Script

Structure the script as an array of chunks. Each chunk is 1-2 sentences
(under 15 words per sentence for cleanest TTS output).

```json
[
  {
    "id": "intro",
    "text": "Welcome to Ship It Code.",
    "visual": "Title card with logo, fade in"
  },
  {
    "id": "problem",
    "text": "Most developers spend years building projects that never see the light of day.",
    "visual": "Code editor with unfinished projects, tabs piling up"
  },
  {
    "id": "hook",
    "text": "Today we are going to break that cycle.",
    "visual": "Transition: shatter effect, clean workspace appears"
  }
]
```

### Chunk guidelines

- **1-2 sentences per chunk** — keeps TTS errors isolated and predictable
- **Under 15 words per sentence** — avoids `long_tail` warnings
- **Visual cue per chunk** — describes what the Remotion scene should show
- **Unique ID per chunk** — used for filenames (`intro.wav`, `intro.mp4`)

## Step 2: Generate TTS (Per Chunk)

Uses a locally fine-tuned Chatterbox TTS model. No API keys needed.

**Repo:** `~/repos/chatterbox-finetuning/`

### Generate one chunk at a time

For each chunk, edit `inference.py` and run:

```python
TEXT_TO_SAY = "Welcome to Ship It Code."
AUDIO_PROMPT = "./speaker_reference/narrator_ref.wav"
OUTPUT_FILE = "./out/chunks/intro.wav"
```

```bash
cd ~/repos/chatterbox-finetuning
python inference.py
```

Or generate all chunks in a loop by modifying `inference.py` to accept
a JSON chunk list and output one `.wav` per chunk.

### Why small chunks

- **Fewer errors**: Short text = less chance of garbled output or cutoff
- **Exact timing**: You know exactly which words map to which audio
- **Easy retakes**: If one chunk sounds wrong, regenerate just that one
- **Visual sync**: Each video segment matches its audio perfectly

### Parameters

Edit the `PARAMS` dict in `inference.py`:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `temperature` | 0.8 | Higher = more variation, lower = more monotone |
| `exaggeration` | 0.5 | Controls emotional expressiveness (0-1) |
| `cfg_weight` | 0.5 | Classifier-free guidance strength (Normal mode only) |
| `repetition_penalty` | 1.2 | Penalizes repeating the same token |

### Voice clone reference

- Current clone: Charisma on Command narrator — see `ship-it-code/knowledge/voice-clone.md`
- Full pipeline for cloning new voices: `production-house/knowledge/voice-cloning.md`
- See `knowledge/video-gen/pipeline-reference.md` for parameter details

## Step 2b: Denoise Audio (Demucs)

After TTS generation, run Demucs to isolate the vocal stem and remove any
background noise or TTS artifacts. This produces cleaner audio without
changing duration.

### Denoise all chunks

```bash
cd <video-dir>

# Back up raw TTS audio
mkdir -p audio/raw
cp audio/*.wav audio/raw/

# Run demucs on each chunk
for wav in audio/*.wav; do
  demucs --two-stems vocals -o out/demucs "$wav"
done

# Replace originals with denoised vocals
for wav in audio/raw/*.wav; do
  name=$(basename "$wav" .wav)
  cp "out/demucs/htdemucs/${name}/vocals.wav" "audio/${name}.wav"
done
```

Output path: `out/demucs/htdemucs/<input-basename>/vocals.wav`

### Verify duration unchanged

```bash
for wav in audio/*.wav; do
  name=$(basename "$wav")
  raw_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "audio/raw/$name")
  new_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$wav")
  echo "$name: raw=${raw_dur}s denoised=${new_dur}s"
done
```

Durations should match within a few milliseconds. If they differ
significantly, something went wrong — fall back to the raw audio.

### When to skip

- If TTS output is already clean (no audible noise), denoising is optional
- Demucs adds ~10-20s per chunk on Apple Silicon (MPS) — budget accordingly

## Step 2c: Verify Audio (Whisper)

After denoising, transcribe each chunk with Whisper and compare against the
script text. This catches garbled output, repeated words, or cutoff audio
before video rendering begins.

### Transcribe all chunks

```bash
cd <video-dir>

for wav in audio/*.wav; do
  python3 -m whisper "$wav" --model large-v3 --language en \
    --output_format json --output_dir audio/
done
```

### Compare against script

For each chunk, compare the Whisper transcript against `script.json`:

```bash
# Quick visual check
for wav in audio/*.wav; do
  name=$(basename "$wav" .wav)
  transcript=$(python3 -c "import json; print(json.load(open('audio/${name}.json'))['text'].strip())")
  echo "--- $name ---"
  echo "  SCRIPT:     $(python3 -c "import json; chunks=json.load(open('script.json')); print(next(c['text'] for c in chunks if '${name#*-}' in c['id']), 'NOT FOUND')")"
  echo "  TRANSCRIPT: $transcript"
done
```

Review the output. Transcription won't be letter-perfect — Whisper may
differ on punctuation, casing, or technical terms (e.g., "TypeScript" →
"Typescript"). Focus on whether the **words and meaning** match.

### When to regenerate

- Missing or extra words → regenerate with `regen_chunk.py --seed <new>`
- Truncated audio (text cuts off mid-sentence) → regenerate
- Hallucinated words not in script → regenerate
- Minor punctuation/casing differences → safe to proceed

### Output format

```json
{"text": "...", "segments": [{"start": 0.0, "end": 3.08, "text": "..."}], "language": "en"}
```

The full transcript is in the top-level `text` field.

## Step 3: Render Video Chunks (Remotion)

Each chunk gets its own Remotion composition whose duration matches its
audio chunk exactly.

### Get audio duration per chunk

```bash
# Returns duration in seconds (e.g., 2.340)
ffprobe -v error -show_entries format=duration -of csv=p=0 out/chunks/intro.wav
```

### Calculate frames

```
durationInFrames = Math.ceil(audioDurationSeconds * 30)   # 30 fps, 4K
```

**Never adjust audio speed to fit video length. Always adjust video
`durationInFrames` to fit audio length.**

### Project structure

```
{project}/
  package.json          # remotion, @remotion/cli, @remotion/bundler, react, react-dom
  src/
    index.js            # registerRoot(RemotionRoot)
    Root.jsx            # <Composition> per chunk (id, fps=30, width=3840, height=2160)
    scenes/
      Intro.jsx         # Scene for "intro" chunk
      Problem.jsx       # Scene for "problem" chunk
      Hook.jsx          # Scene for "hook" chunk
```

### Register compositions (Root.jsx)

```jsx
// Each chunk is a separate Composition with duration from its audio
<Composition id="intro" component={Intro}
  width={3840} height={2160} fps={30}
  durationInFrames={71}   // 2.34s * 30fps = 71 frames
/>
<Composition id="problem" component={Problem}
  width={3840} height={2160} fps={30}
  durationInFrames={142}  // 4.72s * 30fps = 142 frames
/>
```

### Render each chunk

```bash
npx remotion render src/index.js intro out/chunks/intro.mp4 --codec h264 --image-format jpeg
npx remotion render src/index.js problem out/chunks/problem.mp4 --codec h264 --image-format jpeg
npx remotion render src/index.js hook out/chunks/hook.mp4 --codec h264 --image-format jpeg
```

### Resolution formats

| Format | Width | Height | Aspect | Use case |
|--------|-------|--------|--------|----------|
| **Landscape 4K** | 3840 | 2160 | 16:9 | YouTube videos (default) |
| **Shorts 4K** | 2160 | 3840 | 9:16 | YouTube Shorts, TikTok, Reels |

All compositions MUST be 4K at 30fps. Choose landscape or shorts based on
the video format requested.

## Step 4: Assemble Final Video

### Merge audio + video per chunk

```bash
ffmpeg -i out/chunks/intro.mp4 -i out/chunks/intro.wav \
  -c:v copy -c:a aac -b:a 192k out/merged/intro.mp4

ffmpeg -i out/chunks/problem.mp4 -i out/chunks/problem.wav \
  -c:v copy -c:a aac -b:a 192k out/merged/problem.mp4

ffmpeg -i out/chunks/hook.mp4 -i out/chunks/hook.wav \
  -c:v copy -c:a aac -b:a 192k out/merged/hook.mp4
```

### Concatenate all chunks

```bash
# Create filelist.txt (in order)
cat > out/filelist.txt << 'EOF'
file 'merged/intro.mp4'
file 'merged/problem.mp4'
file 'merged/hook.mp4'
EOF

ffmpeg -f concat -safe 0 -i out/filelist.txt -c copy out/assembled.mp4
```

### Add watermark

```bash
ffmpeg -i out/assembled.mp4 \
  -i companies/{company}/assets/brand/{company}-watermark.png \
  -filter_complex "overlay=W-w-50:H-h-50" -c:a copy out/watermarked.mp4
```

### YouTube-optimized encode (final output)

```bash
ffmpeg -i out/watermarked.mp4 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
  {project}/assets/{video-name}.mp4
```

See `knowledge/video-gen/pipeline-reference.md` for more ffmpeg recipes.

## Rules

- **4K only**: All compositions must be 4K at 30fps — landscape (3840x2160) or
  shorts (2160x3840) depending on the requested format
- **Audio drives video length**: Calculate `durationInFrames` from audio duration.
  Never speed up or slow down audio to match video — it degrades quality
- **Small TTS chunks**: 1-2 sentences per chunk. Smaller = fewer errors and
  easier to verify each chunk sounds correct before rendering video
- **Final output goes to `{project}/assets/`**: The finished .mp4 is always
  placed in the project's `assets/` directory, never left in `out/`
- Intermediates (chunks, merged segments) go to `out/` (gitignored)
- Verify tools before starting: `which ffmpeg`, `which npx`
- If ffmpeg missing, instruct user: `brew install ffmpeg`
- Voice clone model lives at `~/repos/chatterbox-finetuning/`
- Never commit intermediate binary files (mp3, wav, mp4) to git
- Add `out/` to `.gitignore` in project directories
- Always apply the watermark using the active company's brand assets
- Present render plan (chunk count, resolution, estimated duration) before rendering
- Respect company isolation: only use brand assets for the matching company

## Output

- Script chunk list (JSON or structured text)
- Per-chunk audio in `out/chunks/` (.wav)
- Per-chunk silent video in `out/chunks/` (.mp4)
- Per-chunk merged video in `out/merged/` (.mp4)
- **Final video in `{project}/assets/`** (.mp4, 4K, with audio and watermark)
- Summary: chunk count, total duration, resolution, file size, output path
