import {
  assertUniOperatorHostingerSnapshot,
  createPlannerHostingerInventory,
} from "@apidevelopers/uni-operator-hostinger-adapter";

import { createSiteFactoryDryRun } from "./planner.mjs";

export function createUniOperatorSiteFactoryDryRun({
  manifest,
  hostingerSnapshot,
  wordpressDiscovery,
  wordpressAuthentication = null,
  pagePlan = null,
  generatedAt = new Date().toISOString(),
}) {
  assertUniOperatorHostingerSnapshot(hostingerSnapshot);

  const report = createSiteFactoryDryRun({
    manifest,
    hostingerInventory: createPlannerHostingerInventory(hostingerSnapshot),
    wordpressDiscovery,
    wordpressAuthentication,
    pagePlan,
    generatedAt,
  });

  return Object.freeze({
    ...report,
    execution: Object.freeze({
      controlPlane: "uni.operator",
      hostingerConnector: "direct",
      githubSecretRequired: false,
      githubActionsRole: "ci-and-public-probe-only",
      authenticatedWordPressRead:
        wordpressAuthentication?.validated === true && pagePlan !== null,
    }),
  });
}
