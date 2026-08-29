# Trust Face Deep Embedding v1 — arquitetura e evidência

## Status

**Architecture contract / laboratory foundation. Not a trained biometric model.**

This document defines the next owned Trust Face representation path after the first consented-lab diagnostic showed that the handcrafted `32x32 -> gradient histogram -> weighted cosine` baseline did not separate genuine and impostor pairs sufficiently.

Current explicit limits:

- `productionReady=false`
- `biometricClaimReady=false`
- `trainedWeightsIncluded=false`
- `livenessPad=false`
- `openSetIdentification=false`
- 1:1 verification remains the only biometric matching scope.

## Design direction

The owned v1 representation is fixed around:

`aligned 112x112 RGB -> mobile residual CNN -> 512D embedding -> L2 normalization -> cosine verification`

Training is based on a normalized hypersphere and an additive angular margin objective. A quality-aware extension may adapt the training margin using a bounded quality proxy, but quality never becomes a substitute for identity matching and it does not directly choose the production threshold.

The architecture contract deliberately separates:

1. face detection;
2. landmark estimation;
3. alignment;
4. capture quality;
5. identity embedding;
6. 1:1 verification;
7. threshold calibration;
8. PAD/liveness.

## Scientific references

The design is informed by public scientific work, not by copying proprietary commercial implementations.

- ArcFace (CVPR 2019): additive angular margin on normalized face features and class weights, explicitly designed to improve intra-class compactness and inter-class separation.
- MagFace (CVPR 2021): representation learning where feature magnitude is related to face quality and training handles ambiguous/low-quality samples differently.
- AdaFace (CVPR 2022): quality-adaptive margin training, motivated by the degradation of recognition under low-quality imagery.
- NIST FRTE 1:1 Verification remains the external benchmark model for reporting operational false-match and false-non-match behavior.

Canonical references:

- https://openaccess.thecvf.com/content_CVPR_2019/html/Deng_ArcFace_Additive_Angular_Margin_Loss_for_Deep_Face_Recognition_CVPR_2019_paper.html
- https://openaccess.thecvf.com/content/CVPR2021/html/Meng_MagFace_A_Universal_Representation_for_Face_Recognition_and_Quality_Assessment_CVPR_2021_paper.html
- https://openaccess.thecvf.com/content/CVPR2022/html/Kim_AdaFace_Quality_Adaptive_Margin_for_Face_Recognition_CVPR_2022_paper.html
- https://pages.nist.gov/frvt/html/frvt11.html

## Owned architecture contract

Default lab architecture:

- input: aligned 112x112 RGB;
- stem: 3x3 convolution, stride 2, PReLU-class activation;
- four mobile residual stages;
- depthwise-separable residual blocks;
- channel widths: 64, 96, 160, 256;
- stage depths: 1, 2, 3, 2;
- global depthwise projection;
- 512-dimensional output;
- L2-normalized inference embedding.

This is an API Developers.digital architecture contract. It is not represented as MobileFaceNet, ArcFace, AdaFace, or MagFace itself.

## Audit contract

Every trained model artifact must be bound to a deterministic manifest containing at least:

- model ID and version;
- architecture version;
- input geometry and embedding dimension;
- parameter count when known;
- training dataset manifest SHA-256 digest;
- exact training code commit;
- deterministic seed;
- objective family;
- angular scale and margin;
- quality-aware flag;
- epoch count;
- calibration dataset digest;
- target FMR and selected threshold when calibration exists.

The manifest rejects raw images, raw embeddings, biometric templates, names, emails, phones, documents, CPF/RG or equivalent direct PII fields.

## Evidence required before promotion

A trained v1 model is not promoted merely because loss decreases.

Minimum evidence before claiming the 50% product milestone:

- permitted training dataset with explicit authority and reproducible manifest;
- subject-disjoint validation and test partitions;
- model artifact digest;
- training run metadata;
- genuine/impostor score distributions;
- FMR/FNMR across a threshold sweep;
- comparison against the current handcrafted baseline using the same evaluation protocol;
- no regression in privacy/audit boundaries;
- no threshold selected on the final test split.

Later production gates additionally require substantially broader datasets, demographic and capture-condition analysis, attack/PAD evaluation, device diversity, latency/throughput, cross-tenant isolation, revocation and independent validation.

## Non-goals

This v1 contract does not:

- include trained weights;
- import third-party proprietary face models;
- claim NIST-equivalent performance;
- implement open-set identification;
- implement PAD/liveness;
- authorize use of unlicensed or non-consented biometric datasets.
