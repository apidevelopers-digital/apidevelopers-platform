# ControlFace10K benchmark evidence v1

**Mode:** laboratory / benchmark-only  
**Dataset:** ControlFace10K (`synthetic_permissive`, declared `CC-BY-4.0`)  
**Benchmark run:** `33935831994`  
**Result commit:** `d01076603e5acc3e5d0a94370cd943e3edc8b23a`

## Execution

The approved benchmark completed successfully on the frozen deterministic subset:

- selected identities: `64`
- selected images: `192`
- selection fingerprint SHA-256: `395736f00372d0412c0dc921fc51511851d67ee244e31b22647ca3afd1dcbe0b`
- one YuNet detection in all `192/192` images
- SFace inference completed: `81/192` (`42.19%`)
- pose gate rejected: `111/192` (`57.81%`)
- admitted images per identity:
  - `47` identities with 1 admitted image
  - `17` identities with 2 admitted images
  - `0` identities with 3 admitted images

Pose rejection reason counts may overlap for a single image:

- `pose_yaw_out_of_lab_range`: `111`
- `pose_eye_span_too_small`: `31`
- `pose_roll_out_of_lab_range`: `1`

## Sanitized score evidence

Same-person pairs among admitted captures:

- count: `17`
- min: `0.5699205399`
- mean: `0.6708919792`
- max: `0.7328163385`
- p50: `0.6806925535`

Different-identity pairs:

- count: `3223`
- min: `-0.1554649025`
- mean: `0.2703218428`
- max: `0.8212292790`
- p50: `0.2493369281`
- p95: `0.5733844399`

Observed sample-only separation:

- `min(same) - max(different) = -0.2513087392`

The negative gap means the admitted score distributions overlap in this synthetic benchmark.

## Frozen experimental band replay

The frozen profile remained unchanged:

- `lowSimilarityMax = 0.31725`
- `highSimilarityMin = 0.50375`
- profile SHA-256: `69870e817be79f29a4cbbdd0a69b63d13eac8d5475026cd7c8e6b211306c7a64`

Same-person classifications:

- `high_similarity`: `17/17`
- `indeterminate_retry`: `0/17`
- `low_similarity`: `0/17`

Different-identity classifications:

- `low_similarity`: `2170/3223` (`67.33%`)
- `indeterminate_retry`: `784/3223` (`24.33%`)
- `high_similarity`: `269/3223` (`8.35%`)

The `8.35%` value is a benchmark classification frequency, **not** FAR/FMR. The band is not a calibrated biometric threshold and does not create an identity decision.

## Interpretation

**Confirmed:** the current SFace 128D lab path and frozen exploratory band do not provide clean same/different separation on this independent synthetic benchmark. In particular, the different-identity maximum (`0.8212`) exceeds the same-person minimum (`0.5699`) and the different-identity p95 (`0.5734`) is already above the frozen `highSimilarityMin`.

**Confirmed:** the pose-quality gate is also restrictive on this dataset, admitting only `81/192` images and no identity with all three poses admitted.

**Inference:** this benchmark increases confidence that the next laboratory work should focus on representation/robustness and admission behavior rather than tuning the frozen band against this dataset. The frozen band must remain unchanged and benchmark-only.

## Runtime and provenance

- OpenCV runtime: `4.13.0`
- NumPy: `2.2.6`
- `opencv-python` tag: `92`
- pinned `opencv-python` commit: `4ddfc013fd1f13d9b9e379dbebf2cdbeb052e7f8`
- OpenCV built temporarily from source
- global install performed: `false`
- SFace dimension: `128D`
- YuNet/SFace model hashes remained pinned

## Privacy and safety

No raw images, crops, embeddings, detector scores, individual cosines, selected identity paths or person-associated scores are stored in GitHub.

The benchmark does **not** authorize or claim:

- threshold calibration
- FAR/FMR validation
- FRR/FNMR validation
- match/identity claim
- production readiness
- production authorization
- recalibration of the frozen band

The Trust Face laboratory development baseline remains `85% ±5 p.p.`; this benchmark does not justify increasing it.
