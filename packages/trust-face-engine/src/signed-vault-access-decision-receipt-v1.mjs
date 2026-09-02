import { createHash } from "node:crypto";

export const TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_RECEIPT_V1 = Object.freeze({
  version: "trust-face-signed-vault-access-decision-receipt/v1",
  purpose: "record-lab-signed-vault-access-decision-metadata",
  mode: "simulation-lab-only",
  metadataOnly: true,
  appendOnlyDecisionReceipt: true,
  accessDecisionRecordedInLab: true,
  proofPayloadStored: false,
  signatureStored: false,
  publicKeyStored: false,
  privateKeyAccepted: false,
  privateKeyStored: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  ciphertextStored: false,
  kmsMaterialAccepted: false,
  externalAuditSinkIntegrated: false,
  productionAuditStoreIntegrated: false,
  realVaultAccessAuthorized: false,
  realVaultReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceSignedVaultAccessDecisionReceiptV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceSignedVaultAccessDecisionReceiptV1Error";
    this.code = code;
  }
}

const fail = (code, message) => { throw new TrustFaceSignedVaultAccessDecisionReceiptV1Error(code, message); };
const req = (v, f) => {
  if (typeof v !== "string" || !v.trim()) fail("invalid_signed_vault_access_decision_field", `${f} is required`);
  return v.trim();
};
const digest = (v, f) => {
  const s = req(v, f).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(s)) fail("invalid_signed_vault_access_decision_digest", `${f} must be sha256:<64 hex>`);
  return s;
};
const iso = (v, f) => {
  const s = req(v, f), ms = Date.parse(s);
  if (!Number.isFinite(ms)) fail("invalid_signed_vault_access_decision_time", `${f} must be ISO-8601`);
  return new Date(ms).toISOString();
};
const sha = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const forbidden = new Set([
  "image","imageData","rawImage","pixels","video","videoData","frames","bytes","buffer",
  "embedding","embeddings","vector","vectors","template","biometricTemplate","templatePayload",
  "ciphertext","encryptedPayload","encryptedTemplate","payload","privateKey","keyMaterial","kmsMaterial",
  "secret","secretMaterial","plaintext"
]);
function rejectSensitive(value, seen = new Set()) {
  if (value == null || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) fail("signed_vault_access_decision_binary_forbidden", "binary input is forbidden");
  if (seen.has(value)) fail("signed_vault_access_decision_circular_input", "circular input is forbidden");
  seen.add(value);
  for (const [k, v] of Object.entries(value)) {
    if (forbidden.has(k)) fail("signed_vault_access_decision_sensitive_payload_forbidden", `${k} is forbidden`);
    rejectSensitive(v, seen);
  }
  seen.delete(value);
}
const repo = (r) => {
  if (!r || ["create","getById","list"].some((m)=>typeof r[m] !== "function")) {
    fail("invalid_signed_vault_access_decision_repository", "decisionRepository must provide create, getById and list");
  }
};
function buildReceipt({decisionId,vaultReceiptId,authorizationDigest,purposeCode,keyId,trustedKeyFingerprint=null,proofDigest,decision,reasonCode,decisionAt}) {
  const body = {
    version: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_RECEIPT_V1.version,
    purpose: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_RECEIPT_V1.purpose,
    mode: TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_RECEIPT_V1.mode,
    decisionId: req(decisionId,"decisionId"),
    vaultReceiptId: req(vaultReceiptId,"vaultReceiptId"),
    authorizationDigest: digest(authorizationDigest,"authorizationDigest"),
    purposeCode: req(purposeCode,"purposeCode"),
    keyId: req(keyId,"keyId"),
    trustedKeyFingerprint: trustedKeyFingerprint == null ? null : digest(trustedKeyFingerprint,"trustedKeyFingerprint"),
    proofDigest: digest(proofDigest,"proofDigest"),
    decision: decision === "allow" ? "allow" : decision === "deny" ? "deny" : fail("invalid_signed_vault_access_decision","decision must be allow or deny"),
    reasonCode: req(reasonCode,"reasonCode"),
    decisionAt: iso(decisionAt,"decisionAt"),
    metadataOnly: true,
    proofPayloadStored: false,
    signatureStored: false,
    publicKeyStored: false,
    privateKeyStored: false,
    rawBiometricPayloadStored: false,
    rawEmbeddingStored: false,
    ciphertextStored: false,
    productionReady: false,
  };
  return Object.freeze({...body, decisionReceiptDigest: sha(body)});
}
export function assertSignedVaultAccessDecisionReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) fail("signed_vault_access_decision_receipt_required","receipt is required");
  const rebuilt = buildReceipt(receipt);
  if (receipt.decisionReceiptDigest !== rebuilt.decisionReceiptDigest) fail("signed_vault_access_decision_receipt_tampered","decision receipt digest mismatch");
  return Object.freeze({valid:true, decisionId:rebuilt.decisionId, decision:rebuilt.decision, decisionReceiptDigest:rebuilt.decisionReceiptDigest});
}
export function createSignedVaultAccessDecisionAudit({signedFlow,decisionRepository}={}) {
  if (!signedFlow || typeof signedFlow.getCryptographicallyVerifiedAuthorizedReceipt !== "function") {
    fail("invalid_signed_governed_vault_flow","signedFlow must provide getCryptographicallyVerifiedAuthorizedReceipt");
  }
  repo(decisionRepository);
  return Object.freeze({
    ...TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_RECEIPT_V1,
    async evaluateAndRecord({decisionId,vaultReceiptId,authorization,proof,purposeCode,now}={}) {
      rejectSensitive({authorization, purposeCode});
      const keyId=req(proof?.keyId,"proof.keyId");
      const authorizationDigest=digest(authorization?.authorizationDigest,"authorization.authorizationDigest");
      const proofDigest=sha({
        keyId,
        algorithm:req(proof?.algorithm,"proof.algorithm"),
        signedMessage:req(proof?.signedMessage,"proof.signedMessage"),
        authorizationDigest:digest(proof?.authorizationDigest,"proof.authorizationDigest"),
        signature:req(proof?.signature,"proof.signature"),
      });
      const decisionAt=iso(now,"now");
      let access=null, decision="deny", reasonCode="access-denied", trustedKeyFingerprint=null;
      try {
        access=await signedFlow.getCryptographicallyVerifiedAuthorizedReceipt({vaultReceiptId,authorization,proof,purposeCode,now});
        decision="allow";
        reasonCode="authorized";
        trustedKeyFingerprint=digest(access?.trustedKey?.keyFingerprint,"access.trustedKey.keyFingerprint");
      } catch (error) {
        reasonCode=typeof error?.code === "string" && error.code ? error.code : "access-denied";
      }
      const receipt=buildReceipt({decisionId,vaultReceiptId,authorizationDigest,purposeCode,keyId,trustedKeyFingerprint,proofDigest,decision,reasonCode,decisionAt});
      if (await decisionRepository.getById(receipt.decisionId)) fail("signed_vault_access_decision_conflict","decisionId already recorded");
      const stored=await decisionRepository.create(receipt);
      assertSignedVaultAccessDecisionReceipt(stored);
      return Object.freeze({allowed:decision==="allow", access:decision==="allow"?access:null, decisionReceipt:stored, productionReady:false});
    },
    async getDecisionReceipt(decisionId) {
      const stored=await decisionRepository.getById(req(decisionId,"decisionId"));
      if (!stored) return null;
      assertSignedVaultAccessDecisionReceipt(stored);
      return stored;
    },
  });
}
