const STAGE_ORDER = new Map([
  ["experiment", 0],
  ["prototype", 1],
  ["managed", 2],
  ["certified", 3],
  ["official", 4],
  ["deprecated", 5],
  ["retired", 6],
]);

const REQUIREMENTS = {
  prototype: ["ownership"],
  managed: ["ownership", "contracts", "security", "documentation"],
  certified: [
    "ownership",
    "contracts",
    "security",
    "documentation",
    "tests",
    "observability",
  ],
  official: [
    "ownership",
    "contracts",
    "security",
    "documentation",
    "tests",
    "observability",
    "runtime",
  ],
};

function hasContracts(asset) {
  const contracts = asset?.contracts ?? {};
  return Boolean(contracts.manifest || contracts.api || contracts.events);
}

function collectEvidence(asset, runtimeEvidence = null) {
  return {
    ownership: Boolean(asset?.owner && asset.owner.trim()),
    contracts: hasContracts(asset),
    tests: asset?.evidence?.tests === true,
    observability: asset?.evidence?.observability === true,
    security: asset?.evidence?.security === true,
    documentation: asset?.evidence?.documentation === true,
    runtime: Boolean(runtimeEvidence),
  };
}

function validateTransition(currentStage, targetStage) {
  if (!STAGE_ORDER.has(currentStage)) {
    throw new Error(`unknown current promotion stage: ${currentStage}`);
  }
  if (!STAGE_ORDER.has(targetStage)) {
    throw new Error(`unknown target promotion stage: ${targetStage}`);
  }

  const current = STAGE_ORDER.get(currentStage);
  const target = STAGE_ORDER.get(targetStage);

  if (target <= current) {
    throw new Error(
      `target stage ${targetStage} must be higher than current stage ${currentStage}`,
    );
  }

  if (target - current > 1) {
    throw new Error(
      `promotion must advance one stage at a time: ${currentStage} -> ${targetStage}`,
    );
  }
}

export function assessAssetPromotion({
  asset,
  targetStage,
  runtimeEvidence = null,
  assessor = "PromotionEngine",
  assessedAt = new Date().toISOString(),
}) {
  if (!asset?.id) {
    throw new Error("asset.id is required");
  }

  const currentStage = asset.promotionStage;
  validateTransition(currentStage, targetStage);

  const requiredEvidence = REQUIREMENTS[targetStage] ?? [];
  const evidence = collectEvidence(asset, runtimeEvidence);
  const missingEvidence = requiredEvidence.filter((item) => !evidence[item]);

  let decision = "approved";
  const reasons = [];

  if (missingEvidence.includes("runtime")) {
    decision = "needs-review";
    reasons.push("runtime evidence requires explicit technical verification");
  }

  const blockingEvidence = missingEvidence.filter((item) => item !== "runtime");
  if (blockingEvidence.length > 0) {
    decision = "blocked";
    reasons.push(
      `missing required evidence: ${blockingEvidence.join(", ")}`,
    );
  }

  if (missingEvidence.length === 0) {
    reasons.push(
      `all evidence required for ${targetStage} is present`,
    );
  }

  const score =
    requiredEvidence.length === 0
      ? 100
      : Math.round(
          ((requiredEvidence.length - missingEvidence.length) /
            requiredEvidence.length) *
            100,
        );

  return {
    schemaVersion: 1,
    assetId: asset.id,
    currentStage,
    targetStage,
    decision,
    requiredEvidence,
    missingEvidence,
    reasons,
    score,
    assessedAt,
    assessor,
    metadata: {
      mutatesAsset: false,
      evidenceSnapshot: evidence,
    },
  };
}
