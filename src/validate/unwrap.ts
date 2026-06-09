/**
 * Structural unwrapping for validator inputs.
 *
 * Dispatches on `type` to extract inner credentials from:
 * - VerifiablePresentation (R4.1)
 * - GetOpenBadgeCredentialsResponse (R4.2)
 * - EnvelopedVerifiableCredential (R4.3, R4.4)
 * - Single unwrapped credential (R4.7)
 *
 * Decode failures are captured as errors entries (R4.6) instead of throwing.
 */

export type UnwrapResult = {
  credentials: Array<{
    index: number;
    source: string;
    doc: Record<string, unknown>;
  }>;
  errors: Array<{ index: number; message: string }>;
};

/**
 * Unwrap a validator input into individual credentials.
 * Preserves order and index so per-credential results map back to input position.
 */
export function unwrap(input: Record<string, unknown>): UnwrapResult {
  const types = normalizeType(input.type);

  if (types.includes("VerifiablePresentation")) {
    return unwrapPresentation(input);
  }

  if (types.includes("GetOpenBadgeCredentialsResponse")) {
    return unwrapBatchResponse(input);
  }

  if (types.includes("EnvelopedVerifiableCredential")) {
    return unwrapEnveloped(input, 0, "enveloped");
  }

  // Single unwrapped credential (R4.7)
  return {
    credentials: [{ index: 0, source: "single", doc: input }],
    errors: [],
  };
}

/**
 * Normalize a type field into an array of strings for dispatch.
 */
function normalizeType(type: unknown): string[] {
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === "string");
  return [];
}

/**
 * Unwrap a VerifiablePresentation (R4.1).
 * Extracts `verifiableCredential` (single or array); each inner item is either
 * a plain credential or an EnvelopedVerifiableCredential (recursed).
 */
function unwrapPresentation(input: Record<string, unknown>): UnwrapResult {
  const credentials: UnwrapResult["credentials"] = [];
  const errors: UnwrapResult["errors"] = [];

  const vc = input.verifiableCredential;
  const items: unknown[] = Array.isArray(vc) ? vc : vc != null ? [vc] : [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    processItem(item, i, "presentation", credentials, errors);
  }

  return { credentials, errors };
}

/**
 * Unwrap a GetOpenBadgeCredentialsResponse (R4.2).
 * Extracts the `credential` array and treats each like a VP member.
 */
function unwrapBatchResponse(input: Record<string, unknown>): UnwrapResult {
  const credentials: UnwrapResult["credentials"] = [];
  const errors: UnwrapResult["errors"] = [];

  const creds = input.credential;
  const items: unknown[] = Array.isArray(creds) ? creds : creds != null ? [creds] : [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    processItem(item, i, "batch", credentials, errors);
  }

  return { credentials, errors };
}

/**
 * Process a single item from a VP or batch response.
 * If it's an EnvelopedVerifiableCredential, decode it; otherwise treat as a plain credential.
 */
function processItem(
  item: unknown,
  index: number,
  parentSource: string,
  credentials: UnwrapResult["credentials"],
  errors: UnwrapResult["errors"],
): void {
  if (!item || typeof item !== "object") {
    errors.push({ index, message: "Inner item is not an object" });
    return;
  }

  const doc = item as Record<string, unknown>;
  const types = normalizeType(doc.type);

  if (types.includes("EnvelopedVerifiableCredential")) {
    const result = unwrapEnveloped(doc, index, `${parentSource}:enveloped`);
    credentials.push(...result.credentials);
    errors.push(...result.errors);
  } else {
    credentials.push({ index, source: parentSource, doc });
  }
}

/**
 * Unwrap an EnvelopedVerifiableCredential (R4.3, R4.4).
 * The `id` field is a `data:` URI. Parse media type and payload.
 */
function unwrapEnveloped(
  input: Record<string, unknown>,
  index: number,
  sourcePrefix: string,
): UnwrapResult {
  const id = input.id;
  if (typeof id !== "string") {
    return {
      credentials: [],
      errors: [{ index, message: "EnvelopedVerifiableCredential missing or invalid 'id' field" }],
    };
  }

  // Parse the data: URI
  const parsed = parseDataUri(id);
  if (!parsed) {
    return {
      credentials: [],
      errors: [{ index, message: `Invalid data: URI format in 'id': ${truncate(id)}` }],
    };
  }

  const { mediaType, payload } = parsed;
  const mt = mediaType.toLowerCase();

  // Determine format from media type — check SD-JWT first since "sd-jwt" also contains "jwt"
  if (mt.includes("vc+sd-jwt") || mt.includes("sd-jwt")) {
    return decodeSdJwt(payload, index, `${sourcePrefix}:sd-jwt`);
  }

  if (mt.includes("vc+jwt") || mt.includes("jwt")) {
    return decodeVcJwt(payload, index, `${sourcePrefix}:vc-jwt`);
  }

  return {
    credentials: [],
    errors: [{ index, message: `Unsupported media type in enveloped credential: ${mediaType}` }],
  };
}

/**
 * Parse a data: URI into media type and payload.
 * Expected format: data:<mediaType>[;base64],<payload>
 * For JWTs, the payload is typically not base64-encoded (it's the raw compact serialization).
 */
function parseDataUri(uri: string): { mediaType: string; payload: string } | null {
  const dataPrefix = "data:";
  if (!uri.startsWith(dataPrefix)) return null;

  const rest = uri.slice(dataPrefix.length);
  const commaIdx = rest.indexOf(",");
  if (commaIdx < 0) return null;

  const meta = rest.slice(0, commaIdx);
  const payload = rest.slice(commaIdx + 1);

  // meta can be "mediaType" or "mediaType;base64" or "mediaType;charset=utf-8" etc.
  const parts = meta.split(";");
  const mediaType = parts[0] || "application/octet-stream";

  // If base64 flag is present, decode the payload
  if (parts.some((p) => p.trim().toLowerCase() === "base64")) {
    try {
      const decoded = Buffer.from(payload, "base64").toString("utf-8");
      return { mediaType, payload: decoded };
    } catch {
      return null;
    }
  }

  // Otherwise return the payload as-is (URI-decoded)
  try {
    return { mediaType, payload: decodeURIComponent(payload) };
  } catch {
    return { mediaType, payload };
  }
}

/**
 * Decode a VC-JWT (R4.3).
 * Split on `.`, base64url-decode the JWS payload (second segment),
 * read the embedded `vc` or credential claim.
 */
function decodeVcJwt(token: string, index: number, source: string): UnwrapResult {
  const parts = token.split(".");
  if (parts.length < 3) {
    return {
      credentials: [],
      errors: [{ index, message: "VC-JWT does not have three dot-separated segments" }],
    };
  }

  const payloadSegment = parts[1];
  let payloadJson: string;
  try {
    payloadJson = base64urlDecode(payloadSegment);
  } catch (err) {
    return {
      credentials: [],
      errors: [
        { index, message: `Failed to base64url-decode VC-JWT payload: ${(err as Error).message}` },
      ],
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson);
  } catch (err) {
    return {
      credentials: [],
      errors: [
        { index, message: `Failed to parse VC-JWT payload as JSON: ${(err as Error).message}` },
      ],
    };
  }

  // The credential is in the `vc` claim, or the payload itself is the credential
  const doc = (payload.vc as Record<string, unknown>) ?? payload;

  if (typeof doc !== "object" || doc === null) {
    return {
      credentials: [],
      errors: [{ index, message: "VC-JWT payload does not contain a valid credential object" }],
    };
  }

  return {
    credentials: [{ index, source, doc }],
    errors: [],
  };
}

/**
 * Decode an SD-JWT (R4.4).
 * Split on `~` to separate issuer-signed JWT from disclosures,
 * then decode the issuer JWT payload the same way as a VC-JWT.
 * Disclosures are ignored for structural validation.
 */
function decodeSdJwt(token: string, index: number, source: string): UnwrapResult {
  // SD-JWT format: <issuer-jwt>~<disclosure1>~<disclosure2>~...~[<kb-jwt>]
  const tildeIdx = token.indexOf("~");
  const issuerJwt = tildeIdx >= 0 ? token.slice(0, tildeIdx) : token;

  // Decode the issuer-signed JWT exactly like a VC-JWT
  return decodeVcJwt(issuerJwt, index, source);
}

/**
 * Base64url decode a string to UTF-8.
 */
function base64urlDecode(input: string): string {
  // Replace base64url characters and add padding
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLen);
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Truncate a long string for error messages.
 */
function truncate(s: string, maxLen = 80): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}
