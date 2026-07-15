# GitHub Write Pipeline

Status: active
Date: 2026-07-15
Owner: API Developers.digital

## Purpose

Prevent repeated failures when creating or updating files through the GitHub API.

## Known failure classes

1. Invalid Base64
   - Never assemble Base64 manually.
   - Encode UTF-8 bytes with a deterministic encoder.
   - Validate decode(encode(content)) == content before sending.

2. Wrong SHA
   - Read the current file before updating.
   - Use the exact current SHA.
   - Create new files without SHA.

3. Malformed JSON
   - Build the complete payload before the API call.
   - Validate all required fields: owner, repo, path, message, content, branch.

4. Assumed path
   - List the parent directory before reading an uncertain path.
   - Treat 404 as inventory evidence, not success.

5. Success without evidence
   - Require API success and commit SHA.
   - Re-read the file when applicable.
   - Never report completion without evidence.

6. Oversized changes
   - Prefer one file per call.
   - Prefer small, cohesive commits.
   - Split large documents by domain.

## Mandatory workflow

1. Read branch state.
2. Check whether the target file exists.
3. Read current SHA when updating.
4. Generate content outside the API call.
5. Validate content syntax.
6. Encode UTF-8 content to Base64 automatically.
7. Validate Base64 round-trip.
8. Build complete JSON payload.
9. Execute the GitHub API call.
10. Confirm commit SHA.
11. Re-read the file.
12. Record evidence.

## Completion rule

A write is complete only when:
- the API returns success;
- a commit SHA exists;
- the target file can be read;
- the stored content matches the expected content.

## Permanent rule

Validate first. Execute second. Verify third. Only then declare completion.
