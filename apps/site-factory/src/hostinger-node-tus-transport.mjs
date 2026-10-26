import { validateTusProgress, assertTusWriteAllowed } from "./hostinger-node-tus-protocol.mjs";

// Only transports minted here are accepted. No fetch, URLs or credentials.
const trustedMocks = new WeakSet();

export function createTusMockTransport(responses) {
  if (!Array.isArray(responses)) throw new Error("invalid_mock_responses");
  let index = 0;
  const requests = [];
  const transport = Object.freeze({
    send(request) {
      if (request.method !== "PATCH" || request.headers["Tus-Resumable"] !== "1.0.0" ||
          request.headers["Upload-Offset"] !== request.offset ||
          request.headers["Content-Type"] !== "application/offset+octet-stream" ||
          !(request.body instanceof Uint8Array)) throw new Error("invalid_tus_request");
      requests.push(Object.freeze({ offset: request.offset, length: request.body.length }));
      if (index >= responses.length) throw new Error("missing_tus_response");
      return responses[index++];
    },
    get requests() { return Object.freeze([...requests]); },
    assertExhausted() { if (index !== responses.length) throw new Error("unused_tus_responses"); }
  });
  trustedMocks.add(transport);
  return transport;
}

export function executeTusMockUpload({ bytes, chunkSize, transport, startOffset = 0 }) {
  if (!trustedMocks.has(transport)) throw new Error("tus_transport_not_mock");
  if (!(bytes instanceof Uint8Array)) throw new Error("invalid_bytes");
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("invalid_chunk_size");
  if (!Number.isSafeInteger(startOffset) || startOffset < 0 || startOffset > bytes.length) throw new Error("invalid_start_offset");
  let offset = startOffset;
  while (offset < bytes.length) {
    const end = Math.min(offset + chunkSize, bytes.length);
    const response = transport.send(Object.freeze({
      method: "PATCH", offset,
      headers: Object.freeze({ "Tus-Resumable": "1.0.0", "Upload-Offset": offset, "Content-Type": "application/offset+octet-stream" }),
      body: bytes.slice(offset, end)
    }));
    if (!response || response.status !== 204) throw new Error("unexpected_tus_status");
    if (response.offset !== end) throw new Error("tus_offset_mismatch");
    offset = validateTusProgress({ length: bytes.length, previous: offset, status: response.status, offset: response.offset }).offset;
  }
  transport.assertExhausted();
  return Object.freeze({ mode: "mock", writesEnabled: false, offset, complete: offset === bytes.length, requests: transport.requests });
}

export function executeTusRealUpload() {
  assertTusWriteAllowed();
}
