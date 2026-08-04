from pathlib import Path

runtime = Path("apps/api-gateway/src/operational-runtime.mjs").read_text()

presence_markers = [
    "createHostingerWriterRuntime",
    "hostingerWriterFactory = createHostingerWriterRuntime",
    "hostingerWriter: Object.freeze({",
]

for marker in presence_markers:
    if marker not in runtime:
        raise SystemExit(f"required_marker_missing:{marker}")

unique_markers = [
    "roots: []",
    "enabled: false",
    "approvalVerifier: async () => false",
]

for marker in unique_markers:
    if runtime.count(marker) != 1:
        raise SystemExit(f"marker_count_invalid:{marker}:{runtime.count(marker)}")

for forbidden in [
    "HOSTINGER_WRITER_ENABLED",
    "/hostinger/write",
    "/hostinger/replace",
    "exposedHttpRoutes: true",
]:
    if forbidden in runtime:
        raise SystemExit(f"forbidden_marker:{forbidden}")

print("OK hostinger writer runtime bridge disabled")
