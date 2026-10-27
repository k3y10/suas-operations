const encoder = new TextEncoder();

export const OBJECT_PROOF_VERSION = "quaksatch-object-proof-v1";
export const LEGACY_OBJECT_PROOF_VERSION = "quakwrap-object-proof-v1";
export const OBJECT_ID_DIGEST_VERSION = "quaksatch-object-id-v1";
export const LEGACY_OBJECT_ID_DIGEST_VERSION = "quakwrap-object-id-v1";

function resolveProofVersion(value) {
  const version = value || OBJECT_PROOF_VERSION;
  if (version !== OBJECT_PROOF_VERSION && version !== LEGACY_OBJECT_PROOF_VERSION) {
    throw new Error("Unsupported canonical object proof version.");
  }
  return version;
}

function ascii(value) {
  return encoder.encode(value);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function normalizeRequiredString(value, label, maxLength) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`);
  const normalized = value.trim().normalize("NFC");
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function encodeString(value) {
  const normalized = value.normalize("NFC");
  const bytes = encoder.encode(normalized);
  return concatBytes([ascii(`s${bytes.byteLength}:`), bytes]);
}

function compareUtf8(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function encodeCanonicalValue(value) {
  if (value === null) return ascii("n;");
  if (value === true) return ascii("b1;");
  if (value === false) return ascii("b0;");

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        "Canonical object proofs only accept safe integers as numbers. Represent decimal values as strings.",
      );
    }
    const normalized = Object.is(value, -0) ? 0 : value;
    return ascii(`i${normalized};`);
  }

  if (typeof value === "string") return encodeString(value);

  if (Array.isArray(value)) {
    return concatBytes([
      ascii(`a${value.length}:`),
      ...value.map((item) => encodeCanonicalValue(item)),
    ]);
  }

  if (isPlainObject(value)) {
    const normalized = new Map();
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.normalize("NFC");
      if (normalized.has(normalizedKey)) {
        throw new Error("Object contains keys that collide after Unicode normalization.");
      }
      normalized.set(normalizedKey, item);
    }

    const keys = [...normalized.keys()].sort(compareUtf8);
    const parts = [ascii(`o${keys.length}:`)];
    for (const key of keys) {
      parts.push(encodeString(key), encodeCanonicalValue(normalized.get(key)));
    }
    return concatBytes(parts);
  }

  throw new Error(
    "Canonical object proofs accept only null, booleans, strings, safe integers, arrays, and plain objects.",
  );
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalizeObjectProofInput({ objectType, objectId, payload, proofVersion = OBJECT_PROOF_VERSION }) {
  const version = resolveProofVersion(proofVersion);
  const normalizedType = normalizeRequiredString(objectType, "Object type", 120);
  const normalizedId = normalizeRequiredString(objectId, "Object ID", 512);
  const body = encodeCanonicalValue({
    objectType: normalizedType,
    objectId: normalizedId,
    payload,
  });
  return {
    objectType: normalizedType,
    objectId: normalizedId,
    canonicalBytes: concatBytes([encoder.encode(`${version}\0`), body]),
    proofVersion: version,
  };
}

export async function computeCanonicalObjectProof(input) {
  const canonical = canonicalizeObjectProofInput(input);
  const objectIdVersion = canonical.proofVersion === LEGACY_OBJECT_PROOF_VERSION ? LEGACY_OBJECT_ID_DIGEST_VERSION : OBJECT_ID_DIGEST_VERSION;
  const objectIdDigest = await sha256Hex(
    concatBytes([
      encoder.encode(`${objectIdVersion}\0`),
      encodeString(canonical.objectType),
      encodeString(canonical.objectId),
    ]),
  );
  return {
    version: canonical.proofVersion,
    commitment: await sha256Hex(canonical.canonicalBytes),
    objectIdDigest,
    canonicalBytes: canonical.canonicalBytes,
  };
}

export async function buildObjectProofRegistration({
  objectType,
  objectId,
  payload,
  label = "",
  expiresAt = null,
  metadata = {},
  includeObjectIdDigest = false,
}) {
  const canonical = canonicalizeObjectProofInput({ objectType, objectId, payload });
  const proof = await computeCanonicalObjectProof({ objectType, objectId, payload });
  const cleanLabel = String(label || "").trim();
  return {
    subjectType: "custom",
    label: (cleanLabel || canonical.objectType).slice(0, 120),
    commitment: proof.commitment,
    expiresAt,
    metadata: {
      ...metadata,
      proof_kind: "canonical-object",
      proof_version: OBJECT_PROOF_VERSION,
      object_type: canonical.objectType,
      ...(includeObjectIdDigest ? { object_id_digest: proof.objectIdDigest } : {}),
    },
  };
}
