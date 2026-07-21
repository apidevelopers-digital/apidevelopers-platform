import { projectPortalInstitutionalState } from "./institutional-facade.mjs";

export class PortalInstitutionalPublisherError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalInstitutionalPublisherError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalInstitutionalPublisherError(code, message, details);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    fail(
      "PORTAL_INSTITUTIONAL_PUBLISHER_ADAPTER_INVALID",
      `${name} must be a function`,
    );
  }
}

function assertPublisher(publisher) {
  if (
    !publisher ||
    typeof publisher !== "object" ||
    publisher.mutationAllowed !== true
  ) {
    fail(
      "PORTAL_INSTITUTIONAL_PUBLISHER_INVALID",
      "publisher must be an explicit internal mutation port",
    );
  }
  assertFunction(publisher.publish, "publisher.publish");
}

function assertReceipt(receipt, projection) {
  if (!receipt || typeof receipt !== "object") {
    fail(
      "PORTAL_INSTITUTIONAL_PUBLISHER_RECEIPT_INVALID",
      "publisher must return a receipt object",
    );
  }

  if (receipt.sourceCommit !== projection.sourceCommit) {
    fail(
      "PORTAL_INSTITUTIONAL_PUBLISHER_COMMIT_MISMATCH",
      "publication receipt belongs to another source commit",
      {
        expected: projection.sourceCommit,
        observed: receipt.sourceCommit,
      },
    );
  }

  if (receipt.contentChecksum !== projection.contentChecksum) {
    fail(
      "PORTAL_INSTITUTIONAL_PUBLISHER_CHECKSUM_MISMATCH",
      "publication receipt checksum differs from the projected content",
      {
        expected: projection.contentChecksum,
        observed: receipt.contentChecksum,
      },
    );
  }
}

export function createPortalInstitutionalPublisher({
  publisher,
  projector = projectPortalInstitutionalState,
  projectionOptions = {},
} = {}) {
  assertPublisher(publisher);
  assertFunction(projector, "projector");

  async function projectAndPublish({
    reader,
    expectedCurrentCommit,
    projectionOptions: callProjectionOptions = {},
  } = {}) {
    const projection = await projector({
      ...projectionOptions,
      ...callProjectionOptions,
      reader,
    });

    const receipt = await publisher.publish(projection, {
      expectedCurrentCommit,
    });

    assertReceipt(receipt, projection);

    return Object.freeze({
      sourceCommit: projection.sourceCommit,
      contentChecksum: projection.contentChecksum,
      published: receipt.published,
    });
  }

  return Object.freeze({
    projectAndPublish,
    mutationAllowed: true,
  });
}
