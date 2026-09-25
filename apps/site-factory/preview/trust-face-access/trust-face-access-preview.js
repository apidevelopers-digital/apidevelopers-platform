const DEFAULT_API_BASE = "https://gateway.apidevelopers.digital";

const $ = (selector) => document.querySelector(selector);
const statusEl = $("#status");
const userId = $("#user-id");
const userName = $("#user-name");
const buttons = [$("#register-button"), $("#login-button"), $("#status-button")];

function apiBase() {
  return new URLSearchParams(location.search).get("apiBase") || DEFAULT_API_BASE;
}

function setStatus(message, details) {
  statusEl.textContent = message + (details ? `\n\n${typeof details === "string" ? details : JSON.stringify(details, null, 2)}` : "");
}

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64Url(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function createOptions(options) {
  const publicKey = { ...options.publicKey };
  publicKey.challenge = fromBase64Url(publicKey.challenge);
  publicKey.user = { ...publicKey.user, id: fromBase64Url(publicKey.user.id) };
  publicKey.excludeCredentials = (publicKey.excludeCredentials || []).map((credential) => ({
    ...credential,
    id: fromBase64Url(credential.id),
  }));
  return { publicKey };
}

function getOptions(options) {
  const publicKey = { ...options.publicKey };
  publicKey.challenge = fromBase64Url(publicKey.challenge);
  publicKey.allowCredentials = (publicKey.allowCredentials || []).map((credential) => ({
    ...credential,
    id: fromBase64Url(credential.id),
  }));
  return { publicKey };
}

async function post(path, payload) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function get(path) {
  const response = await fetch(`${apiBase()}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function register() {
  if (!window.PublicKeyCredential) throw new Error("Navegador sem PublicKeyCredential.");
  const currentUserId = userId.value.trim();
  const currentUserName = userName.value.trim();

  const options = await post("/v1/trust/face-access/register/options", {
    userId: currentUserId,
    userName: currentUserName,
    displayName: currentUserName,
  });

  setStatus("Abrindo biometria do dispositivo…");
  const credential = await navigator.credentials.create(createOptions(options));
  const result = await post("/v1/trust/face-access/register/verify", {
    userId: currentUserId,
    challenge: options.publicKey.challenge,
    credentialId: credential.id,
    transports: credential.response?.getTransports?.() || [],
    rawId: toBase64Url(credential.rawId),
    response: {
      attestationObject: toBase64Url(credential.response.attestationObject),
      clientDataJSON: toBase64Url(credential.response.clientDataJSON),
    },
    type: credential.type,
  });

  setStatus("Credencial cadastrada em preview.", result);
}

async function login() {
  if (!window.PublicKeyCredential) throw new Error("Navegador sem PublicKeyCredential.");
  const currentUserId = userId.value.trim();

  const options = await post("/v1/trust/face-access/authenticate/options", { userId: currentUserId });
  setStatus("Abrindo Face ID/passkey…");
  const credential = await navigator.credentials.get(getOptions(options));
  const result = await post("/v1/trust/face-access/authenticate/verify", {
    userId: currentUserId,
    challenge: options.publicKey.challenge,
    credentialId: credential.id,
    rawId: toBase64Url(credential.rawId),
    response: {
      authenticatorData: toBase64Url(credential.response.authenticatorData),
      clientDataJSON: toBase64Url(credential.response.clientDataJSON),
      signature: toBase64Url(credential.response.signature),
      userHandle: credential.response.userHandle ? toBase64Url(credential.response.userHandle) : null,
    },
    type: credential.type,
  });

  setStatus("Autenticado em preview.", result);
}

async function loadStatus() {
  setStatus("Consultando status…");
  setStatus("Status recebido.", await get("/v1/trust/face-access/status"));
}

async function run(action) {
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    setStatus("Erro no preview.", error instanceof Error ? error.message : String(error));
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

$("#register-button").addEventListener("click", () => run(register));
$("#login-button").addEventListener("click", () => run(login));
$("#status-button").addEventListener("click", () => run(loadStatus));
loadStatus().catch((error) => setStatus("Não foi possível consultar o status inicial.", error instanceof Error ? error.message : String(error)));
