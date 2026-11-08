// Pure TUS protocol checks. No network or write capability.
export function validateTusProgress({length, previous, status, offset}) {
  for (const [name, value] of Object.entries({length, previous, offset})) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid_${name}`);
  }
  if (previous > length || offset > length || offset < previous) throw new Error("invalid_tus_offset");
  if (status !== 204 && status !== 201) throw new Error("unexpected_tus_status");
  if (status === 201 && previous !== 0) throw new Error("unexpected_tus_creation");
  return Object.freeze({offset, complete: offset === length});
}
export function assertTusWriteAllowed() {
  throw new Error("hostinger_tus_write_blocked:executor_not_approved");
}
