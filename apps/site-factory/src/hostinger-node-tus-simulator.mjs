import { validateTusProgress } from "./hostinger-node-tus-protocol.mjs";

// Scripted simulation only. No fetch, credentials, URLs, or network calls.
export function simulateTusChunks({ bytes, chunkSize, responses, startOffset = 0 }) {
  if (!(bytes instanceof Uint8Array)) throw new Error("invalid_bytes");
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("invalid_chunk_size");
  if (!Number.isSafeInteger(startOffset) || startOffset < 0 || startOffset > bytes.length) throw new Error("invalid_start_offset");
  if (!Array.isArray(responses)) throw new Error("invalid_responses");
  let offset = startOffset;
  let index = 0;
  const chunks = [];
  while (offset < bytes.length) {
    const end = Math.min(offset + chunkSize, bytes.length);
    const response = responses[index++];
    if (!response) throw new Error("missing_tus_response");
    if (response.status !== 204) throw new Error("unexpected_tus_status");
    if (response.offset !== end) throw new Error("tus_offset_mismatch");
    const result = validateTusProgress({ length: bytes.length, previous: offset, status: 204, offset: response.offset });
    chunks.push(Object.freeze({ start: offset, end }));
    offset = result.offset;
  }
  if (index !== responses.length) throw new Error("unused_tus_responses");
  return Object.freeze({ mode: "simulation", writesEnabled: false, offset, complete: offset === bytes.length, chunks: Object.freeze(chunks) });
}
