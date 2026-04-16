---
id: hq-supabase-storage-bucket-creation
title: Create Supabase Storage bucket before uploading objects
scope: global
trigger: uploading files to Supabase Storage
enforcement: soft
version: 1
created: 2026-03-28
updated: 2026-03-28
source: back-pressure-failure
---

## Rule

Before uploading to Supabase Storage via `PUT /storage/v1/object/{bucket}/{path}`, verify the bucket exists. If it returns 404 "Bucket not found", create it first via `POST /storage/v1/bucket` with `{"id":"{name}","name":"{name}","public":false}`. Use the service role key for both operations.

