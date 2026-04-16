---
id: {your-app}-release
title: Indigo HQ App Release Process
scope: repo
trigger: releasing {your-app}
enforcement: soft
---

## Rule

- Version lives in 3 files (must stay in sync): `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
- Release workflow triggers on push to `release` branch or `workflow_dispatch`
- Always merge `main` → `release` (fast-forward preferred), never commit directly to `release`
- The `upload-to-s3` job uses `apt-get install awscli` which can fail on newer Ubuntu runners — may need migration to `aws-actions/configure-aws-credentials` + pre-installed CLI
- Draft releases need manual publish from GitHub UI
- Builds are unsigned (macOS code signing secrets commented out in workflow)

