---
name: Video Generator
description: "Video production: script to voiceover, Remotion render, and ffmpeg post-processing"
---

# Video Generator

End-to-end video production pipeline. Generates voiceover audio, renders
React-based video with Remotion, and post-processes with ffmpeg.

## Pipeline

```
1. Script       -> structured text with timing cues
2. Voiceover    -> ElevenLabs TTS API -> .mp3
3. Composition  -> Remotion React components -> silent .mp4
4. Post-process -> ffmpeg merge audio+video, watermark, encode -> final .mp4
```

## Responsibilities

1. Accept a script (text or structured JSON with sections/timing)
2. Generate voiceover audio via ElevenLabs TTS API
3. Create or modify Remotion compositions matching the script's visual needs
4. Render the composition to silent video with `npx remotion render`
5. Merge audio and video with ffmpeg, apply watermark, encode for YouTube
6. Output the final .mp4 with a summary of what was produced

## ElevenLabs Voiceover

The `@elevenlabs/cli` manages conversational agents, NOT TTS.
Use the REST API directly via curl for speech generation.

```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your script text here",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75,
      "style": 0.0,
      "use_speaker_boost": true
    }
  }' \
  --output voiceover.mp3
```

- Read API key from `$ELEVENLABS_API_KEY` env var (never hardcode)
- For long scripts, split into sections and concatenate with ffmpeg
- Get audio duration: `ffprobe -v error -show_entries format=duration -of csv=p=0 voiceover.mp3`
- See `knowledge/video-gen/pipeline-reference.md` for voice listing, models, and output formats

## Remotion Composition

Project structure (see `scratch/code-typing-video/` for reference):

```
{project}/
  package.json          # remotion, @remotion/cli, @remotion/bundler, react, react-dom
  src/
    index.js            # registerRoot(RemotionRoot)
    Root.jsx            # <Composition> declarations (id, fps, width, height, durationInFrames)
    {Scene}.jsx         # Scene components using AbsoluteFill, useCurrentFrame, interpolate
```

All compositions MUST be 4K: `width={3840} height={2160} fps={30}`

Render command:
```bash
npx remotion render src/index.js {CompositionId} out/video.mp4 \
  --codec h264 --image-format jpeg
```

Match duration to audio: `durationInFrames = Math.ceil(audioDurationSeconds * fps)`

## ffmpeg Post-Processing

**Merge audio + silent video:**
```bash
ffmpeg -i out/video.mp4 -i voiceover.mp3 \
  -c:v copy -c:a aac -b:a 192k -shortest out/merged.mp4
```

**Add PNG watermark (bottom-right):**
```bash
ffmpeg -i out/merged.mp4 \
  -i companies/{company}/assets/brand/{company}-watermark.png \
  -filter_complex "overlay=W-w-50:H-h-50" -c:a copy out/watermarked.mp4
```

**YouTube-optimized encode (final output -> project assets/):**
```bash
ffmpeg -i out/watermarked.mp4 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
  {project}/assets/{video-name}.mp4
```

See `knowledge/video-gen/pipeline-reference.md` for more recipes.

## Rules

- **4K only**: All compositions must be 3840x2160 at 30fps — no exceptions
- **Final output goes to `{project}/assets/`**: The finished .mp4 is always
  placed in the project's `assets/` directory, never left in `out/`
- Intermediates (silent render, voiceover) go to `out/` (gitignored)
- Verify tools before starting: `which ffmpeg`, `which npx`
- If ffmpeg missing, instruct user: `brew install ffmpeg`
- Never hardcode API keys — read from env vars
- Never commit intermediate binary files (mp3, wav) to git
- Add `out/` to `.gitignore` in project directories
- Always apply the watermark using the active company's brand assets
- Present render plan (resolution, fps, duration, scenes) before rendering
- Respect company isolation: only use brand assets for the matching company

## Output

- Voiceover audio in `out/` (.mp3, intermediate)
- Remotion composition source (JSX)
- Rendered silent video in `out/` (.mp4, intermediate)
- **Final video in `{project}/assets/`** (.mp4, 4K, with audio and watermark)
- Summary: duration, resolution, file size, output path
