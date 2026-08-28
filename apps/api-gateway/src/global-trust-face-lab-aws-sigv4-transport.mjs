import { createHash, createHmac } from "node:crypto";

const DEFAULT_REGION = "sa-east-1";
const ALGORITHM = "AWS4-HMAC-SHA256";

function fail(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(url) {
  const pairs = [];
  for (const [key, value] of url.searchParams.entries()) {
    pairs.push([rfc3986(key), rfc3986(value)]);
  }
  pairs.sort(([aKey, aValue], [bKey, bValue]) =>
    aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey));
  return pairs.map(([key, value]) => `${key}=${value}`).join("&");
}

function canonicalUri(url) {
  if (!url.pathname) return "/";
  return url.pathname
    .split("/")
    .map((segment) => rfc3986(decodeURIComponent(segment)))
    .join("/");
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/gu, " ");
}

function amzTimestamp(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function resolveCredentials(env) {
  const accessKeyId = String(env?.AWS_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = String(env?.AWS_SECRET_ACCESS_KEY ?? "").trim();
  const sessionToken = String(env?.AWS_SESSION_TOKEN ?? "").trim();
  if (!accessKeyId || !secretAccessKey) {
    fail(
      "TRUST_FACE_LAB_AWS_CREDENTIALS_UNAVAILABLE",
      "AWS runtime credentials are unavailable",
    );
  }
  return { accessKeyId, secretAccessKey, sessionToken };
}

function signingKey(secretAccessKey, dateStamp, region, service) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, "aws4_request");
}

function buildSignedRequest({
  env,
  region,
  service,
  url,
  method,
  headers = {},
  body = new Uint8Array(),
  now,
}) {
  const credentials = resolveCredentials(env);
  const timestamp = amzTimestamp(now);
  const dateStamp = timestamp.slice(0, 8);
  const payload = body == null ? new Uint8Array() : body;
  const payloadHash = sha256(payload);

  const canonicalHeaders = new Map();
  canonicalHeaders.set("host", url.host);
  canonicalHeaders.set("x-amz-date", timestamp);
  canonicalHeaders.set("x-amz-content-sha256", payloadHash);

  for (const [name, value] of Object.entries(headers)) {
    canonicalHeaders.set(name.toLowerCase(), normalizeHeaderValue(value));
  }
  if (credentials.sessionToken) {
    canonicalHeaders.set("x-amz-security-token", credentials.sessionToken);
  }

  const headerNames = [...canonicalHeaders.keys()].sort();
  const canonicalHeaderBlock = headerNames
    .map((name) => `${name}:${normalizeHeaderValue(canonicalHeaders.get(name))}\n`)
    .join("");
  const signedHeaders = headerNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri(url),
    canonicalQuery(url),
    canonicalHeaderBlock,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    timestamp,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(credentials.secretAccessKey, dateStamp, region, service),
    stringToSign,
    "hex",
  );

  const requestHeaders = Object.fromEntries(canonicalHeaders.entries());
  requestHeaders.authorization =
    `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    method,
    headers: requestHeaders,
    body: method === "GET" || method === "DELETE" ? undefined : payload,
  };
}

function parseAwsErrorBody(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson({ fetchImpl, ...request }) {
  let response;
  try {
    response = await fetchImpl(request.url, request.options);
  } catch (cause) {
    fail("TRUST_FACE_LAB_AWS_NETWORK_ERROR", "AWS request failed", cause);
  }
  const text = await response.text();
  if (!response.ok) {
    const parsed = parseAwsErrorBody(text);
    const error = new Error("AWS request returned a non-success status");
    error.code = "TRUST_FACE_LAB_AWS_HTTP_ERROR";
    error.status = response.status;
    error.awsCode = parsed.__type ?? parsed.code ?? parsed.Code ?? null;
    throw error;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (cause) {
    fail("TRUST_FACE_LAB_AWS_RESPONSE_INVALID", "AWS response was not valid JSON", cause);
  }
}

class Command {
  constructor(input = {}) {
    this.input = input;
  }
}

export class CreateFaceLivenessSessionCommand extends Command {}
export class GetFaceLivenessSessionResultsCommand extends Command {}
export class CompareFacesCommand extends Command {}
export class PutObjectCommand extends Command {}
export class DeleteObjectCommand extends Command {}

function rekognitionOperation(command) {
  if (command instanceof CreateFaceLivenessSessionCommand) return "CreateFaceLivenessSession";
  if (command instanceof GetFaceLivenessSessionResultsCommand) return "GetFaceLivenessSessionResults";
  if (command instanceof CompareFacesCommand) return "CompareFaces";
  fail("TRUST_FACE_LAB_AWS_COMMAND_UNSUPPORTED", "Unsupported Rekognition command");
}

export class RekognitionClient {
  constructor({
    region = DEFAULT_REGION,
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
  } = {}) {
    this.region = region;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async send(command) {
    if (typeof this.fetchImpl !== "function") {
      fail("TRUST_FACE_LAB_AWS_FETCH_UNAVAILABLE", "fetch is unavailable");
    }
    const operation = rekognitionOperation(command);
    const body = Buffer.from(JSON.stringify(command.input ?? {}), "utf8");
    const url = new URL(`https://rekognition.${this.region}.amazonaws.com/`);
    const options = buildSignedRequest({
      env: this.env,
      region: this.region,
      service: "rekognition",
      url,
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `RekognitionService.${operation}`,
      },
      body,
      now: this.now(),
    });
    return requestJson({
      fetchImpl: this.fetchImpl,
      url,
      options,
    });
  }
}

function encodeS3Path(bucket, key) {
  const segments = [bucket, ...String(key ?? "").split("/")];
  return `/${segments.map(rfc3986).join("/")}`;
}

function s3Operation(command) {
  if (command instanceof PutObjectCommand) return "PutObject";
  if (command instanceof DeleteObjectCommand) return "DeleteObject";
  fail("TRUST_FACE_LAB_AWS_COMMAND_UNSUPPORTED", "Unsupported S3 command");
}

export class S3Client {
  constructor({
    region = DEFAULT_REGION,
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
  } = {}) {
    this.region = region;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async send(command) {
    if (typeof this.fetchImpl !== "function") {
      fail("TRUST_FACE_LAB_AWS_FETCH_UNAVAILABLE", "fetch is unavailable");
    }
    const operation = s3Operation(command);
    const bucket = String(command?.input?.Bucket ?? "").trim();
    const key = String(command?.input?.Key ?? "").trim();
    if (!bucket || !key) {
      fail("TRUST_FACE_LAB_AWS_S3_INPUT_INVALID", "S3 Bucket and Key are required");
    }

    const url = new URL(`https://s3.${this.region}.amazonaws.com${encodeS3Path(bucket, key)}`);
    const method = operation === "PutObject" ? "PUT" : "DELETE";
    const body = operation === "PutObject"
      ? (command.input.Body ?? new Uint8Array())
      : new Uint8Array();
    const headers = operation === "PutObject" && command.input.ContentType
      ? { "content-type": command.input.ContentType }
      : {};

    const options = buildSignedRequest({
      env: this.env,
      region: this.region,
      service: "s3",
      url,
      method,
      headers,
      body,
      now: this.now(),
    });

    let response;
    try {
      response = await this.fetchImpl(url, options);
    } catch (cause) {
      fail("TRUST_FACE_LAB_AWS_NETWORK_ERROR", "AWS S3 request failed", cause);
    }
    if (!response.ok) {
      const text = await response.text();
      const error = new Error("AWS S3 request returned a non-success status");
      error.code = "TRUST_FACE_LAB_AWS_HTTP_ERROR";
      error.status = response.status;
      error.awsCode = parseAwsErrorBody(text).Code ?? null;
      throw error;
    }
    return {};
  }
}

export function createGlobalTrustFaceLabAwsSigV4Primitives({
  env = process.env,
  region = DEFAULT_REGION,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    client: new RekognitionClient({ region, env, fetchImpl, now }),
    commands: Object.freeze({
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
      CompareFacesCommand,
    }),
    s3Client: new S3Client({ region, env, fetchImpl, now }),
    s3Commands: Object.freeze({
      PutObjectCommand,
      DeleteObjectCommand,
    }),
    descriptor: Object.freeze({
      provider: "aws-sigv4-native",
      region,
      transport: "node-native",
      networkCalled: false,
      credentialsResolved: false,
    }),
  });
}
