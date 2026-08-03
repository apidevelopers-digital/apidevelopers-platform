const EXPECTED_SCHEMA_VERSION = "operator-github-app-pilot/v2";
const EXPECTED_ORGANIZATION = "apidevelopers-digital";
const EXPECTED_APP_NAME = "API Developers Operator Gateway Pilot";
const EXPECTED_HOMEPAGE_URL = "https://github.com/apidevelopers-digital";

const EXPECTED_REPOSITORIES = Object.freeze([
  ".github",
  "apidevelopers-institution",
  "apidevelopers-platform",
]);

const EXPECTED_REPOSITORY_PERMISSIONS = Object.freeze({
  actions: "read",
  administration: "read",
  checks: "read",
  commit_statuses: "read",
  contents: "read",
  issues: "read",
  metadata: "read",
  pull_requests: "read",
});

const EXPECTED_RUNNER = Object.freeze({
  name: "igor-mac-runner",
  labels: Object.freeze(["self-hosted", "macOS", "X64"]),
});

const EXPECTED_KEYCHAIN = Object.freeze({
  service: "digital.apidevelopers.operator-gateway",
  account: "github-app-private-key",
  reference: "keychain://github/operator-gateway/app-private-key",
});

const FORBIDDEN_FIELD_PATTERN =
  /(^|[_-])(private[_-]?key|pem|token|secret|password|credential|authorization|client[_-]?secret)($|[_-])/i;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sameObject(actual, expected) {
  if (!isPlainObject(actual)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    sameArray(actualKeys, expectedKeys) &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

function detectSecretMaterial(value, path, errors) {
  if (typeof value === "string") {
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(value)) {
      errors.push(`${path}: private key material is forbidden`);
    }
    if (/^(gh[opsu]_|github_pat_)/i.test(value.trim())) {
      errors.push(`${path}: GitHub token material is forbidden`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      detectSecretMaterial(entry, `${path}[${index}]`, errors),
    );
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, entry] of Object.entries(value)) {
    if (
      key !== "privateKeyFingerprintSha256" &&
      FORBIDDEN_FIELD_PATTERN.test(key)
    ) {
      errors.push(`${path}.${key}: secret-bearing field is forbidden`);
    }
    detectSecretMaterial(entry, `${path}.${key}`, errors);
  }
}

export function validateOperatorGitHubAppPilotManifestV2(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze(["manifest must be a plain object"]),
      evidence: null,
    });
  }

  detectSecretMaterial(input, "manifest", errors);

  if (input.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EXPECTED_SCHEMA_VERSION}`);
  }
  if (input.mode !== "pre-provisioning") {
    errors.push("mode must be pre-provisioning");
  }
  if (input.status !== "planned") {
    errors.push("status must be planned");
  }
  if (input.organization !== EXPECTED_ORGANIZATION) {
    errors.push(`organization must be ${EXPECTED_ORGANIZATION}`);
  }

  if (!isPlainObject(input.app)) {
    errors.push("app must be an object");
  } else {
    if (input.app.name !== EXPECTED_APP_NAME) {
      errors.push(`app.name must be ${EXPECTED_APP_NAME}`);
    }
    if (input.app.slug !== null) {
      errors.push("app.slug must be null before creation");
    }
    if (input.app.homepageUrl !== EXPECTED_HOMEPAGE_URL) {
      errors.push(`app.homepageUrl must be ${EXPECTED_HOMEPAGE_URL}`);
    }
    if (input.app.webhookActive !== false) {
      errors.push("app.webhookActive must be false");
    }
    if (!sameArray(input.app.events, [])) {
      errors.push("app.events must be empty");
    }
    if (
      !sameObject(
        input.app.repositoryPermissions,
        EXPECTED_REPOSITORY_PERMISSIONS,
      )
    ) {
      errors.push(
        `app.repositoryPermissions must exactly match ${Object.keys(
          EXPECTED_REPOSITORY_PERMISSIONS,
        ).join(", ")}, all read`,
      );
    }
    for (const field of [
      "organizationPermissions",
      "accountPermissions",
      "enterprisePermissions",
    ]) {
      if (!sameObject(input.app[field], {})) {
        errors.push(`app.${field} must be empty`);
      }
    }
  }

  if (!isPlainObject(input.installation)) {
    errors.push("installation must be an object");
  } else {
    if (input.installation.scope !== "only-this-account") {
      errors.push("installation.scope must be only-this-account");
    }
    if (input.installation.repositorySelection !== "selected") {
      errors.push("installation.repositorySelection must be selected");
    }
    if (!sameArray(input.installation.repositories, EXPECTED_REPOSITORIES)) {
      errors.push(
        `installation.repositories must exactly match ${EXPECTED_REPOSITORIES.join(", ")}`,
      );
    }
  }

  if (!isPlainObject(input.runner)) {
    errors.push("runner must be an object");
  } else {
    if (input.runner.name !== EXPECTED_RUNNER.name) {
      errors.push(`runner.name must be ${EXPECTED_RUNNER.name}`);
    }
    if (!sameArray(input.runner.labels, EXPECTED_RUNNER.labels)) {
      errors.push(
        `runner.labels must exactly match ${EXPECTED_RUNNER.labels.join(", ")}`,
      );
    }
  }

  if (!isPlainObject(input.keychain)) {
    errors.push("keychain must be an object");
  } else {
    for (const [field, expected] of Object.entries(EXPECTED_KEYCHAIN)) {
      if (input.keychain[field] !== expected) {
        errors.push(`keychain.${field} must be ${expected}`);
      }
    }
    if (input.keychain.itemExists !== false) {
      errors.push("keychain.itemExists must be false before storage");
    }
  }

  if (!isPlainObject(input.authorizations)) {
    errors.push("authorizations must be an object");
  } else {
    for (const field of [
      "configureGitHubAppPilot",
      "storeKeyInKeychain",
      "installGitHubAppPilot",
      "executeReadonlyPilot",
    ]) {
      if (input.authorizations[field] !== false) {
        errors.push(`authorizations.${field} must be false in committed staging`);
      }
    }
  }

  if (!isPlainObject(input.evidence)) {
    errors.push("evidence must be an object");
  } else {
    for (const field of [
      "appId",
      "appSlug",
      "installationId",
      "privateKeyFingerprintSha256",
    ]) {
      if (input.evidence[field] !== null) {
        errors.push(`evidence.${field} must be null before provisioning`);
      }
    }
  }

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  if (uniqueErrors.length > 0) {
    return Object.freeze({
      ok: false,
      errors: uniqueErrors,
      evidence: null,
    });
  }

  return Object.freeze({
    ok: true,
    errors: Object.freeze([]),
    evidence: Object.freeze({
      schemaVersion: input.schemaVersion,
      mode: input.mode,
      status: input.status,
      organization: input.organization,
      appName: input.app.name,
      appSlug: null,
      homepageUrl: input.app.homepageUrl,
      repositoryPermissions: Object.freeze({
        ...input.app.repositoryPermissions,
      }),
      repositories: Object.freeze([...input.installation.repositories]),
      installationScope: input.installation.scope,
      runnerName: input.runner.name,
      runnerLabels: Object.freeze([...input.runner.labels]),
      keychainReference: input.keychain.reference,
      keychainItemExists: false,
      realActivationAuthorized: false,
      secretMaterialPresent: false,
    }),
  });
}

export const operatorGitHubAppPilotPolicyV2 = Object.freeze({
  schemaVersion: EXPECTED_SCHEMA_VERSION,
  organization: EXPECTED_ORGANIZATION,
  appName: EXPECTED_APP_NAME,
  homepageUrl: EXPECTED_HOMEPAGE_URL,
  repositories: EXPECTED_REPOSITORIES,
  repositoryPermissions: EXPECTED_REPOSITORY_PERMISSIONS,
  runner: EXPECTED_RUNNER,
  keychain: EXPECTED_KEYCHAIN,
});
