# Ralph Test

**Goal:** Test the Pure Ralph Loop with simple tasks.

**Success:** All 3 tasks complete autonomously with proper commits.

## Overview

Simple test project to validate the Pure Ralph Loop works end-to-end before using it on real projects.

## User Stories

### TEST-001: Create test file
**Description:** Create a simple test file to verify the Ralph loop is working.

**Acceptance Criteria:**
- [x] File workspace/ralph-test/hello.txt exists
- [x] File contains the text 'Hello from Ralph Loop!'

### TEST-002: Add timestamp to test file
**Description:** Append a timestamp to the test file.

**Acceptance Criteria:**
- [x] workspace/ralph-test/hello.txt has a second line
- [x] Second line contains 'Executed at:' followed by a timestamp

### TEST-003: Create completion marker
**Description:** Create a completion file indicating the test passed.

**Acceptance Criteria:**
- [x] File workspace/ralph-test/COMPLETE.md exists
- [x] File contains summary of what was tested
