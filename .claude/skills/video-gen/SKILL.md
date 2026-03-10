---
name: Video Generator
description: >
  End-to-end video production pipeline. Script to voiceover (Chatterbox TTS),
  Remotion render, and ffmpeg assembly. Produces 4K YouTube Shorts and landscape
  videos with branded watermarks and verified audio.
---

# Video Generator

End-to-end video production pipeline. Transforms a script into a finished
video: generates voiceover audio in small chunks, renders matching Remotion
video chunks sized to each audio chunk, and assembles the final output.

## Workspace Layout

All heavy assets (models, renders, intermediate files) live in `workspace/`
at the project root. This directory is gitignored — no binary blobs in the repo.

```
workspace/
├── voice-cloning-model/    # Fine-tuned model weights and speaker reference
│   ├── t3_finetuned.safetensors  # Fine-tuned speaker model
│   └── narrator_ref.wav          # Male speaker reference (5-10s clean speech)
├── remotion/               # Remotion video rendering workspace
│   ├── package.json        # remotion, @remotion/cli, react, react-dom
│   ├── src/
│   │   ├── index.js        # registerRoot(RemotionRoot)
│   │   ├── Root.jsx        # <Composition> registry — all scenes here
│   │   ├── styles.js       # Shared colors, fonts, dimensions
│   │   ├── components/     # Reusable components (BrandBackground, CodeBlock, etc.)
│   │   └── scenes/         # One component per video chunk
│   ├── public/             # Static assets (logos, images)
│   └── render-all.mjs      # Batch render script
├── scripts/                # Shell/Python utilities for the pipeline
│   ├── denoise.sh          # Demucs batch denoising
│   ├── verify.sh           # Whisper batch verification
│   └── assemble.sh         # ffmpeg assembly + watermark
└── videos/                 # Per-video working directories
    └── {n}-{video-name}/   # e.g., 1-object-map-short/
        ├── script.json     # Chunk definitions (text + visual cues)
        ├── audio/           # Denoised WAV files (production audio)
        │   └── raw/         # Raw TTS backup (never used in final)
        ├── out/
        │   ├── chunks/      # Silent .mp4 from Remotion + raw .wav from TTS
        │   ├── demucs/      # Demucs vocal stems
        │   └── merged/      # Audio+video merged per chunk
        └── final.mp4        # Assembled, watermarked output
```

### No git repos in workspace

The workspace is a flat working directory, not a collection of cloned repos.
Copy scripts and models directly — never `git clone` into workspace.

**Before creating any git repository, always ask the user for confirmation.**

## Pipeline

```
1. Script          → Structured JSON chunks (1-2 sentences with visual cues)
2. TTS             → Chatterbox generates one .wav per chunk
   2b. Denoise     → Demucs isolates vocals, removes TTS artifacts
   2c. Verify      → Whisper transcribes each chunk, flags mismatches against script
3. Video           → Remotion renders one silent .mp4 per chunk
4. Assembly        → ffmpeg merges audio+video, concatenates chunks, adds watermark, encodes final
```

**Core principle:** Audio drives video length. Each video chunk's
`durationInFrames` is calculated from its audio chunk's duration.
Never speed up or slow down audio — it degrades voice quality.

## Step 1: Write Script

Structure the script as a JSON array of chunks. Save to
`workspace/videos/{n}-{name}/script.json`.

```json
[
  {
    "id": "hook",
    "text": "Stop writing if-else chains. There is a better way.",
    "visual": "Dark code editor, huge if/else block fills screen, red X stamps over it"
  },
  {
    "id": "problem",
    "text": "This is how most devs handle multiple conditions. Fifteen lines of repetitive logic.",
    "visual": "Zoom into ugly 15-line if/else chain, lines highlight one by one"
  },
  {
    "id": "cta",
    "text": "Follow for more clean code tips. Like if this helped.",
    "visual": "Logo animates in, subscribe button pulse"
  }
]
```

### Chunk guidelines

- **1-2 sentences per chunk** — keeps TTS errors isolated and predictable
- **Under 15 words per sentence** — avoids garbled output and `long_tail` warnings
- **Visual cue per chunk** — describes what the Remotion scene should show
- **Unique ID per chunk** — used for filenames (`1-hook.wav`, `1-hook.mp4`)
- **Total spoken duration under 55s** — leaves room for gaps and end segment
- **92 words ~ 32s spoken** — use this ratio to estimate duration while writing

### Chunk structure (YouTube Shorts)

A complete Short typically follows this arc:

| Order | ID | Purpose | Duration |
|-------|----|---------|----------|
| 1 | hook | Stop the scroll, bold claim | 2-3s |
| 2 | problem | Show the pain point | 3-5s |
| 3 | pain | Amplify why it matters | 3-4s |
| 4 | transition | Bridge to solution | 2-3s |
| 5 | solution | Show the fix | 4-6s |
| 6 | before-after | Side by side comparison | 3-5s |
| 7 | benefit | Why this is better | 3-4s |
| 8 | cta | Follow / Like / Subscribe | 2-3s |

Total: 38-60s target (adjustable via gap and end durations in assembly).

## Step 2: Generate TTS (Per Chunk)

Uses a locally fine-tuned Chatterbox TTS model. No API keys needed — runs
entirely on-device (Apple Silicon MPS or CUDA).

### Location

The inference script lives in the chatterbox-finetuning repo and **must be
run from that directory** (it imports local `src/` modules). Model weights
and speaker reference live in the workspace.

```
~/repos/chatterbox-finetuning/        # Inference scripts + venv
├── .venv/                            # Python venv (torch, chatterbox deps)
├── inference.py                      # Single-chunk generation
├── batch_inference.py                # Multi-chunk from script.json
└── speaker_reference/                # (defaults — do NOT use, see below)

workspace/voice-cloning-model/        # Production assets
├── t3_finetuned.safetensors          # Fine-tuned speaker model
└── narrator_ref.wav                  # Male speaker reference
```

**Critical:** Always pass `--model` and `--prompt` explicitly. The script's
defaults point to wrong paths/files. Using the wrong speaker reference
produces the wrong voice (e.g., female instead of male).

### Generate one chunk

```bash
cd ~/repos/chatterbox-finetuning
.venv/bin/python inference.py \
  --text "Stop writing if-else chains. There is a better way." \
  --model "$WORKSPACE/voice-cloning-model/t3_finetuned.safetensors" \
  --prompt "$WORKSPACE/voice-cloning-model/narrator_ref.wav" \
  --output "$WORKSPACE/videos/1-object-map-short/audio/1-hook.wav"
```

(`$WORKSPACE` = the project's `workspace/` absolute path)

### Override TTS parameters

```bash
cd ~/repos/chatterbox-finetuning
.venv/bin/python inference.py \
  --text "Some expressive text." \
  --model "$WORKSPACE/voice-cloning-model/t3_finetuned.safetensors" \
  --prompt "$WORKSPACE/voice-cloning-model/narrator_ref.wav" \
  --temperature 0.9 \
  --exaggeration 0.7 \
  --seed 123 \
  --output out.wav
```

### Generate all chunks (batch)

```bash
cd ~/repos/chatterbox-finetuning
.venv/bin/python batch_inference.py \
  --script "$WORKSPACE/videos/1-object-map-short/script.json" \
  --model "$WORKSPACE/voice-cloning-model/t3_finetuned.safetensors" \
  --prompt "$WORKSPACE/voice-cloning-model/narrator_ref.wav" \
  --output "$WORKSPACE/videos/1-object-map-short/audio/"
```

### Regenerate a failed chunk

```bash
cd ~/repos/chatterbox-finetuning
.venv/bin/python inference.py \
  --text "The corrected sentence." \
  --model "$WORKSPACE/voice-cloning-model/t3_finetuned.safetensors" \
  --prompt "$WORKSPACE/voice-cloning-model/narrator_ref.wav" \
  --output "$WORKSPACE/videos/1-object-map-short/audio/1-hook.wav" \
  --seed 99
```

After regeneration, re-run denoise (Step 2b) and verify (Step 2c).

### CLI reference

| Arg | Default | Description |
|-----|---------|-------------|
| `--text` | sample text | Text to synthesize |
| `--output` | `./ship_it_code_sample.wav` | Output WAV path |
| `--prompt` | `./speaker_reference/narrator_ref.wav` | Speaker reference audio |
| `--model` | config default | Fine-tuned weights (.safetensors) |
| `--seed` | 42 | Random seed for reproducibility |
| `--temperature` | 0.8 | Voice variation (0.6-1.0) |
| `--exaggeration` | 0.5 | Emotional expressiveness (0-1) |
| `--cfg-weight` | 0.5 | Classifier-free guidance (Normal mode) |
| `--repetition-penalty` | 1.2 | Token repetition penalty |

### Why small chunks

- **Fewer errors**: Short text = less chance of garbled output or cutoff
- **Exact timing**: You know exactly which words map to which audio
- **Easy retakes**: Regenerate just the bad chunk, not the whole script
- **Visual sync**: Each video segment matches its audio perfectly

### TTS Parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| `temperature` | 0.8 | Higher = more variation, lower = more monotone (0.6-1.0) |
| `exaggeration` | 0.5 | Emotional expressiveness (0-1) |
| `cfg_weight` | 0.5 | Classifier-free guidance strength (Normal mode) |
| `repetition_penalty` | 1.2 | Penalizes repeating tokens |

### Sentence splitting

`inference.py` handles this automatically:
- Splits on `.?!` boundaries
- Generates per-sentence with Silero VAD silence trimming
- Concatenates with 200ms pauses between sentences

### Output format

- **24kHz mono WAV** — Chatterbox native output
- Files named: `{n}-{chunk-id}.wav` (e.g., `1-hook.wav`, `2-problem.wav`)
- Numbers are 1-indexed, single digit (no zero-padding)

## Step 2b: Denoise Audio (Demucs)

After TTS, run Demucs to isolate the vocal stem and remove background noise
and TTS artifacts. Produces cleaner audio without changing duration.

### Denoise all chunks

```bash
cd workspace/videos/{n}-{name}

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

Or use the script: `workspace/scripts/denoise.sh <video-dir>`

### Verify duration unchanged

```bash
for wav in audio/*.wav; do
  name=$(basename "$wav")
  raw_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "audio/raw/$name")
  new_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$wav")
  echo "$name: raw=${raw_dur}s denoised=${new_dur}s"
done
```

Durations must match within a few milliseconds. If they differ significantly,
fall back to the raw audio from `audio/raw/`.

### When to skip

- If TTS output is already clean (no audible noise), denoising is optional
- Demucs adds ~10-20s per chunk on Apple Silicon — budget accordingly

## Step 2c: Verify Audio (Whisper)

Transcribe each chunk with Whisper and compare against the script.
Catches garbled output, repeated words, or truncated audio before
video rendering begins.

### Transcribe all chunks

```bash
cd workspace/videos/{n}-{name}

for wav in audio/*.wav; do
  python3 -m whisper "$wav" --model large-v3 --language en \
    --output_format json --output_dir audio/
done
```

Or use the script: `workspace/scripts/verify.sh <video-dir>`

### Compare against script

```bash
for wav in audio/*.wav; do
  name=$(basename "$wav" .wav)
  transcript=$(python3 -c "import json; print(json.load(open('audio/${name}.json'))['text'].strip())")
  echo "--- $name ---"
  echo "  SCRIPT:     $(python3 -c "import json; chunks=json.load(open('script.json')); print(next(c['text'] for c in chunks if '${name#*-}' in c['id']), 'NOT FOUND')")"
  echo "  TRANSCRIPT: $transcript"
done
```

### When to regenerate

**Always regenerate if the Whisper transcript doesn't match the script.**

- Missing or extra words
- Wrong words (e.g., "Tidescript" instead of "TypeScript")
- Truncated audio (cuts off mid-sentence)
- Hallucinated words not in the script
- Merged words (e.g., "ShipIt" instead of "Ship It")

Regenerate with a new seed, then re-run denoise and verify.
Repeat until Whisper output matches the script exactly.

## Step 3: Render Video Chunks (Remotion)

Each chunk gets its own Remotion composition whose duration matches its
audio chunk exactly. All Remotion code lives in `workspace/remotion/`.

### Get audio duration per chunk

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 \
  workspace/videos/{n}-{name}/audio/1-hook.wav
# Returns: 2.340 (seconds)
```

### Calculate frames

```
durationInFrames = Math.ceil(audioDurationSeconds * 30)   // 30 fps
```

**Never adjust audio speed to fit video length. Always adjust video
`durationInFrames` to fit audio length.**

### Project structure (workspace/remotion/)

```
workspace/remotion/
├── package.json        # remotion, @remotion/cli, @remotion/bundler, react, react-dom
├── render-all.mjs      # Node.js batch render script
├── src/
│   ├── index.js        # registerRoot(RemotionRoot)
│   ├── Root.jsx        # <Composition> per chunk with calculated durations
│   ├── styles.js       # Shared: colors, fonts, dimensions
│   ├── components/     # Reusable: BrandBackground, CodeBlock, Img
│   └── scenes/         # One component per chunk (Hook.jsx, Problem.jsx, etc.)
└── public/             # Static assets: logos, brand images
```

### Register compositions (Root.jsx)

```jsx
<Composition id="hook" component={Hook}
  width={2160} height={3840} fps={30}
  durationInFrames={71}   // 2.34s * 30 = 71 frames
/>
<Composition id="problem" component={Problem}
  width={2160} height={3840} fps={30}
  durationInFrames={142}  // 4.72s * 30 = 142 frames
/>
```

### Scene pattern

```jsx
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors, fonts } from '../styles';
import { BrandBackground } from '../components/BrandBackground';

export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Animation logic using spring(), interpolate()
  return (
    <BrandBackground>
      {/* Scene content */}
    </BrandBackground>
  );
};
```

### Render each chunk

```bash
cd workspace/remotion
npx remotion render src/index.js hook \
  ../videos/{n}-{name}/out/chunks/1-hook.mp4 \
  --codec h264 --image-format jpeg --crf 1
```

Or batch render all:

```bash
cd workspace/remotion
node render-all.mjs --video ../videos/{n}-{name}/
```

### Merged compositions

One Remotion composition can span multiple audio chunks when a smooth
transition requires it (e.g., TransitionSolution). Concatenate the audio
files and use the combined duration for frame calculation.

### Resolution formats

| Format | Width | Height | Aspect | Use case |
|--------|-------|--------|--------|----------|
| **Shorts 4K** | 2160 | 3840 | 9:16 | YouTube Shorts, TikTok, Reels |
| **Landscape 4K** | 3840 | 2160 | 16:9 | YouTube videos |

All compositions MUST be 4K at 30fps.

## Step 4: Assemble Final Video

### Merge audio + video per chunk

```bash
cd workspace/videos/{n}-{name}

for i in out/chunks/*.mp4; do
  name=$(basename "$i" .mp4)
  ffmpeg -i "$i" -i "audio/${name}.wav" \
    -map 0:v -map 1:a \
    -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 1 \
    "out/merged/${name}.mp4"
done
```

**Critical:** `-map 0:v -map 1:a` forces the TTS audio stream. Without explicit
mapping, ffmpeg may pick Remotion's silent audio track instead.

### Generate gap and end segments

```bash
# 0.2s black gap between chunks
ffmpeg -f lavfi -i "color=c=black:s=2160x3840:r=30:d=0.2" \
  -f lavfi -i "anullsrc=r=48000:cl=mono" -t 0.2 \
  -c:v libx264 -c:a aac out/gap.mp4

# 1.0s freeze frame at end (from last chunk's final frame)
ffmpeg -sseof -0.1 -i out/merged/8-cta.mp4 -vframes 1 -q:v 2 out/lastframe.jpg
ffmpeg -loop 1 -i out/lastframe.jpg \
  -f lavfi -i "anullsrc=r=48000:cl=mono" -t 1.0 \
  -c:v libx264 -c:a aac -pix_fmt yuv420p out/end.mp4
```

### Concatenate all chunks

```bash
# Build filelist with gaps between chunks
{
  for f in out/merged/*.mp4; do
    echo "file '$f'"
    echo "file 'out/gap.mp4'"
  done
  echo "file 'out/end.mp4'"
} > out/filelist.txt

ffmpeg -f concat -safe 0 -i out/filelist.txt -c copy out/assembled.mp4
```

Or use the script: `workspace/scripts/assemble.sh <video-dir>`

### Add watermark + final encode

```bash
ffmpeg -i out/assembled.mp4 \
  -i companies/{company}/assets/brand/{company}-watermark.png \
  -filter_complex "[1:v]scale=150:-1[wm];[0:v][wm]overlay=W-w-60:H-h-60" \
  -c:v libx264 -preset slow -crf 15 -maxrate 8M -bufsize 16M \
  -colorspace bt709 \
  -c:a aac -b:a 192k -ar 48000 -ac 1 \
  -movflags +faststart \
  final.mp4
```

### Encoding settings

| Setting | Value | Reason |
|---------|-------|--------|
| Codec | libx264 | Universal YouTube compatibility |
| CRF | 15 | YouTube-recommended quality |
| Max bitrate | 8M | Prevents spikes that YouTube re-encodes |
| Color space | bt709 | Explicit — Remotion defaults to bt470bg |
| Audio codec | AAC 192k | YouTube standard |
| Sample rate | 48kHz | YouTube standard |
| Channels | **Mono** | Stereo causes near-silent audio bug (2.3 kbps) |
| movflags | +faststart | Enables streaming playback |

## Workspace Setup

### First-time setup

Before running the pipeline, ensure workspace is initialized:

```bash
# Verify required tools
which ffmpeg || echo "MISSING: brew install ffmpeg"
which npx || echo "MISSING: install Node.js"
which python3 || echo "MISSING: install Python 3"
which demucs || echo "MISSING: pip install demucs"
which whisper || echo "MISSING: pip install openai-whisper"
```

### Remotion setup

```bash
cd workspace/remotion
npm install
npx remotion preview   # Opens browser preview for development
```

### Voice cloning setup

```bash
cd ~/repos/chatterbox-finetuning
source .venv/bin/activate
pip install -r requirements.txt
# Model weights: workspace/voice-cloning-model/t3_finetuned.safetensors
# Speaker reference: workspace/voice-cloning-model/narrator_ref.wav
```

### New video setup

```bash
VIDEO_DIR="workspace/videos/{n}-{name}"
mkdir -p "$VIDEO_DIR"/{audio/raw,out/{chunks,demucs,merged}}
# Create script.json in $VIDEO_DIR
```

## Voice Cloning

### Current setup

- Inference repo: `~/repos/chatterbox-finetuning/` (run with `.venv/bin/python`)
- Fine-tuned model: `workspace/voice-cloning-model/t3_finetuned.safetensors`
- Speaker reference: `workspace/voice-cloning-model/narrator_ref.wav` (male voice)
- Mode: Normal (uses `cfg_weight` parameter)
- **Always pass `--model` and `--prompt` explicitly** — script defaults are wrong

### Cloning a new voice

Full pipeline for fine-tuning on a new voice:

1. **Source audio** — YouTube, podcasts, local files (yt-dlp, ffmpeg)
2. **Transcription** — AssemblyAI with speaker diarization
3. **Speaker extraction** — Isolate target speaker segments (pydub)
4. **Dataset creation** — Split into 3-10s clips + metadata.csv (LJSpeech format)
5. **Preprocessing** — Tokenize text + speech, extract embeddings
6. **Fine-tuning** — HuggingFace Trainer on T3 model (~5h on Apple Silicon, 30 epochs)
7. **Inference** — Generate TTS with new speaker reference

**Always ask before creating any repository for voice cloning work.**

See `knowledge/video-gen/pipeline-reference.md` for detailed parameter docs.

## Rules

### Pipeline integrity

- **4K only**: All compositions must be 4K at 30fps — shorts (2160x3840) or
  landscape (3840x2160) based on the requested format
- **Audio drives video length**: Calculate `durationInFrames` from audio duration.
  Never speed up or slow down audio — it degrades voice quality
- **Whisper verification is mandatory**: Never skip Step 2c. Every chunk
  must be transcribed and verified against the script before rendering
- **Zero tolerance on verification**: If Whisper transcript doesn't match
  the script, regenerate the chunk. Never proceed with mismatched audio
- **Always denoise**: Assembly must use demucs-denoised audio, never raw
  TTS output. Raw files are kept in `audio/raw/` as backup only
- **Mono audio only**: Always use `-ac 1` in ffmpeg. Stereo causes a
  near-silent audio bug (2.3 kbps output)
- **Explicit stream mapping**: Always use `-map 0:v -map 1:a` when merging
  audio and video. Without it, ffmpeg picks the wrong stream
- **Always pass --model and --prompt**: The inference script defaults point to
  wrong paths. Always explicitly pass the workspace model and speaker reference.
  Wrong speaker reference = wrong voice (e.g., female instead of male)
- **Run inference from the repo**: `cd ~/repos/chatterbox-finetuning` and use
  `.venv/bin/python` — the script imports local `src/` modules and needs the venv

### Workspace hygiene

- **No git repos in workspace**: Never `git clone` into workspace. Copy files
  directly. Workspace is a flat working directory
- **Never commit binaries**: Audio (.wav), video (.mp4, .mp3), and model files
  (.safetensors) must never be committed to git
- **workspace/ is gitignored**: Entire directory excluded from version control
- **Ask before creating repos**: Always confirm with the user before
  initializing or cloning any git repository
- **Intermediates stay in out/**: Chunks, merged segments, and demucs output
  go to `out/` subdirectories, not alongside source files

### Workflow

- **Present render plan first**: Before rendering, show chunk count, resolution,
  estimated duration, and confirm with the user
- **Small TTS chunks**: 1-2 sentences per chunk. Smaller = fewer errors
- **Verify tools before starting**: Check `ffmpeg`, `npx`, `demucs`, `whisper`
- **If ffmpeg missing**: `brew install ffmpeg`
- **Video naming**: `workspace/videos/{n}-{video-name}/` (1-indexed, no zero-padding)
- **File naming**: `{n}-{chunk-id}.wav` / `{n}-{chunk-id}.mp4` (matches chunk order)

### Company isolation

- **Watermark from company brand**: Always use `companies/{company}/assets/brand/{company}-watermark.png`
- **Respect company isolation**: Only use brand assets for the matching company
- **Final output to project assets**: Copy `final.mp4` to `{project}/assets/` when complete

## Output

- Script chunk list (`script.json`)
- Per-chunk audio in `audio/` (.wav, denoised)
- Per-chunk silent video in `out/chunks/` (.mp4)
- Per-chunk merged video in `out/merged/` (.mp4)
- **Final video: `workspace/videos/{n}-{name}/final.mp4`**
  (4K, with audio and watermark)
- Copy to `{project}/assets/` as the deliverable
- Summary: chunk count, total duration, resolution, file size, output path
