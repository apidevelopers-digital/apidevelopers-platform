from pathlib import Path

runtime = Path("apps/api-gateway/src/operational-runtime.mjs").read_text()
required = [
    'createHostingerWriterRuntime',
    'hostingerWriterFactory = createHostingerWriterRuntime',
    'roots: []',
    'enabled: false',
    'approvalVerifier: async () => false',
    'hostingerWriter: Object.freeze({',
]
for marker in required:
    if runtime.count(marker) != 1:
        raise SystemExit(f"marker_count_invalid:{marker}")

for forbidden in [
    'HOSTINGER_WRITER_ENABLED',
    '/hostinger/write',
    '/hostinger/replace',
    'exposedHttpRoutes: true',
]:
    if forbidden in runtime:
        raise SystemExit(f"forbidden_marker:{forbidden}")

print("OK hostinger writer runtime bridge disabled")
