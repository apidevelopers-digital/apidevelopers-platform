
export class PortalTypedIntegrityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalTypedIntegrityError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalTypedIntegrityError(code, message, details);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finding(code, message, details = {}) {
  return Object.freeze({ code, message, ...structuredClone(details) });
}

function idOf(record) {
  return record?.institutionalId ?? record?.value?.id ?? null;
}

function valueOf(record) {
  return record?.value;
}

function recordsOf(projection) {
  if (!isObject(projection) || !Array.isArray(projection.records)) {
    fail(
      "PORTAL_TYPED_INTEGRITY_INPUT_INVALID",
      "typed projection with records is required",
    );
  }
  return projection.records;
}

function indexByType(records) {
  const byType = new Map();
  const allIds = new Map();

  for (const record of records) {
    if (!isObject(record) || typeof record.institutionalType !== "string" || !isObject(record.value)) {
      fail(
        "PORTAL_TYPED_INTEGRITY_RECORD_INVALID",
        "every typed record must expose institutionalType and value",
      );
    }

    const type = record.institutionalType;
    const id = idOf(record);
    if (typeof id !== "string" || id.length === 0) {
      fail(
        "PORTAL_TYPED_INTEGRITY_RECORD_INVALID",
        "every typed record must expose a non-empty institutional identifier",
        { type },
      );
    }

    const typed = byType.get(type) ?? new Map();
    if (typed.has(id)) {
      fail(
        "PORTAL_TYPED_INTEGRITY_DUPLICATE_ID",
        "duplicate identifier inside institutional type",
        { type, id },
      );
    }
    typed.set(id, record);
    byType.set(type, typed);

    const owners = allIds.get(id) ?? [];
    owners.push(type);
    allIds.set(id, owners);
  }

  return { byType, allIds };
}

function getType(index, type) {
  return index.byType.get(type) ?? new Map();
}

function validateRelations(index, findings) {
  const nodes = getType(index, "Node");
  for (const [id, record] of getType(index, "Relation")) {
    const value = valueOf(record);
    if (!nodes.has(value.from)) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_RELATION_FROM_MISSING",
        "relation source node does not exist",
        { relationId: id, nodeId: value.from },
      ));
    }
    if (!nodes.has(value.to)) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_RELATION_TO_MISSING",
        "relation target node does not exist",
        { relationId: id, nodeId: value.to },
      ));
    }
  }
}

function validateEvidence(index, findings) {
  for (const [id, record] of getType(index, "Evidence")) {
    const subjectId = valueOf(record).subject_id;
    if (!index.allIds.has(subjectId)) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_EVIDENCE_SUBJECT_MISSING",
        "evidence subject does not exist in the typed projection",
        { evidenceId: id, subjectId },
      ));
    }
  }
}

function validateSnapshots(index, sourceCommit, findings) {
  for (const [id, record] of getType(index, "StateSnapshot")) {
    const head = valueOf(record).head;
    if (sourceCommit && head !== sourceCommit) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_SNAPSHOT_HEAD_MISMATCH",
        "snapshot head differs from the projection source commit",
        { snapshotId: id, expected: sourceCommit, observed: head },
      ));
    }
  }
}

function validateIterations(index, findings) {
  for (const [id, record] of getType(index, "Iteration")) {
    const value = valueOf(record);
    const authorized = new Set(value.authorized_actions ?? []);
    const overlap = [...new Set(value.forbidden_actions ?? [])]
      .filter((action) => authorized.has(action))
      .sort();

    if (overlap.length > 0) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_ITERATION_ACTION_CONFLICT",
        "iteration authorizes and forbids the same action",
        { iterationId: id, actions: overlap },
      ));
    }
  }
}

function validateApprovalsAndAudit(index, findings) {
  const approvals = getType(index, "Approval");
  const evidence = getType(index, "Evidence");

  for (const [id, record] of getType(index, "AuditEvent")) {
    const value = valueOf(record);

    if (value.approval_id !== undefined && value.approval_id !== null) {
      const approval = approvals.get(value.approval_id);
      if (!approval) {
        findings.push(finding(
          "PORTAL_TYPED_INTEGRITY_AUDIT_APPROVAL_MISSING",
          "audit event references an approval that does not exist",
          { auditEventId: id, approvalId: value.approval_id },
        ));
      } else if (approval.value.action_id !== value.action_id) {
        findings.push(finding(
          "PORTAL_TYPED_INTEGRITY_AUDIT_APPROVAL_ACTION_MISMATCH",
          "audit event and approval reference different actions",
          {
            auditEventId: id,
            approvalId: value.approval_id,
            auditActionId: value.action_id,
            approvalActionId: approval.value.action_id,
          },
        ));
      }
    }

    if (value.evidence_id !== undefined && value.evidence_id !== null && !evidence.has(value.evidence_id)) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_AUDIT_EVIDENCE_MISSING",
        "audit event references evidence that does not exist",
        { auditEventId: id, evidenceId: value.evidence_id },
      ));
    }
  }
}

function validateSourceCommits(records, sourceCommit, findings) {
  for (const record of records) {
    const observed = record?.sourceRef?.commit;
    if (typeof observed !== "string") {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_SOURCE_REF_MISSING",
        "typed record does not expose a source commit",
        { institutionalType: record?.institutionalType, institutionalId: idOf(record) },
      ));
    } else if (sourceCommit && observed !== sourceCommit) {
      findings.push(finding(
        "PORTAL_TYPED_INTEGRITY_MIXED_COMMIT",
        "typed record belongs to another source commit",
        {
          institutionalType: record.institutionalType,
          institutionalId: idOf(record),
          expected: sourceCommit,
          observed,
        },
      ));
    }
  }
}

export function reconcileTypedIntegrity(
  typedProjection,
  { failOnError = true } = {},
) {
  const records = recordsOf(typedProjection);
  const sourceCommit = typedProjection.sourceCommit;
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    fail(
      "PORTAL_TYPED_INTEGRITY_COMMIT_INVALID",
      "typed projection must expose a full sourceCommit SHA",
    );
  }

  const index = indexByType(records);
  const findings = [];

  validateSourceCommits(records, sourceCommit, findings);
  validateRelations(index, findings);
  validateEvidence(index, findings);
  validateSnapshots(index, sourceCommit, findings);
  validateIterations(index, findings);
  validateApprovalsAndAudit(index, findings);

  findings.sort((a, b) =>
    a.code.localeCompare(b.code) ||
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  );

  const result = Object.freeze({
    status: findings.length === 0 ? "in_sync" : "invalid",
    sourceCommit,
    checkedRecordCount: records.length,
    findingCount: findings.length,
    findings: Object.freeze(findings),
  });

  if (failOnError && findings.length > 0) {
    fail(
      "PORTAL_TYPED_INTEGRITY_INVALID",
      "typed projection failed referential integrity",
      result,
    );
  }

  return result;
}

export function createPortalTypedIntegrityValidator(options = {}) {
  return Object.freeze({
    validate: (typedProjection) => reconcileTypedIntegrity(typedProjection, options),
    mutationAllowed: false,
  });
}
