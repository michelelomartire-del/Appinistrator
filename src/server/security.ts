import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.js";

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options?: crypto.ScryptOptions,
) => Promise<Buffer>;

/* ------------------------------------------------------------------------- */
/* Password: scrypt con parametri espliciti, formato auto-descrittivo         */
/* ------------------------------------------------------------------------- */

const SCRYPT_N = 1 << 15; // 32768
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(
    password.normalize("NFKC"),
    salt,
    SCRYPT_KEYLEN,
    {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: MAX_MEM,
    },
  );
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64!, "base64");
    const expected = Buffer.from(hashB64!, "base64");
    const derived = await scrypt(
      password.normalize("NFKC"),
      salt,
      expected.length,
      {
        N: Number(nStr),
        r: Number(rStr),
        p: Number(pStr),
        maxmem: MAX_MEM,
      },
    );
    return (
      derived.length === expected.length &&
      crypto.timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push("almeno 12 caratteri");
  if (!/[a-z]/.test(password)) issues.push("una lettera minuscola");
  if (!/[A-Z]/.test(password)) issues.push("una lettera maiuscola");
  if (!/\d/.test(password)) issues.push("un numero");
  if (/^(password|effebi|admin)/i.test(password))
    issues.push("una password non prevedibile");
  return issues;
}

/** Genera una password casuale robusta (usata dal CLI di creazione admin). */
export function generatePassword(length = 20): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*+-_";
  let out = "";
  const bytes = crypto.randomBytes(length * 2);
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b < 256 - (256 % alphabet.length)) out += alphabet[b % alphabet.length];
  }
  // garanzia dei requisiti
  return `Aa1${out.slice(3)}`;
}

/* ------------------------------------------------------------------------- */
/* Token, hash e segreti                                                     */
/* ------------------------------------------------------------------------- */

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Hash pseudonimo per IP/email nei log: non reversibile senza la chiave app. */
export function pseudoHash(value: string): string {
  const key = config.encryptionKey ?? "dev-only";
  return crypto
    .createHmac("sha256", key)
    .update(value.toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* ------------------------------------------------------------------------- */
/* Cifratura simmetrica (AES-256-GCM) per i segreti MFA a riposo              */
/* ------------------------------------------------------------------------- */

function encryptionKeyBuffer(): Buffer {
  const key = config.encryptionKey;
  if (!key) throw new Error("APP_ENCRYPTION_KEY non configurata");
  // accetta base64 o stringa: deriviamo comunque 32 byte
  const raw =
    key.length === 44 ? Buffer.from(key, "base64") : Buffer.from(key, "utf8");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    encryptionKeyBuffer(),
    iv,
  );
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${enc.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, dataB64, tagB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64 || !tagB64)
    throw new Error("Segreto cifrato non valido");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKeyBuffer(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* ------------------------------------------------------------------------- */
/* TOTP (RFC 6238) — MFA amministratore senza dipendenze esterne             */
/* ------------------------------------------------------------------------- */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(
  secretBase32: string,
  counter: number,
  digits = 6,
): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function currentTotpCounter(now = Date.now()): number {
  return Math.floor(now / 1000 / 30);
}

export type TotpVerification =
  | { ok: true; counter: number }
  | { ok: false; reason: "non_valido" | "riutilizzato" };

/**
 * Verifica un codice TOTP con tolleranza di ±1 finestra (30s).
 * `lastCounter` impedisce il riutilizzo dello stesso codice (replay).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { lastCounter?: number | null; now?: number; window?: number } = {},
): TotpVerification {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return { ok: false, reason: "non_valido" };
  const now = options.now ?? Date.now();
  const window = options.window ?? 1;
  const center = currentTotpCounter(now);
  let matched: number | null = null;
  for (let offset = -window; offset <= window; offset++) {
    const counter = center + offset;
    if (timingSafeEqualString(totpCode(secretBase32, counter), normalized)) {
      matched = counter;
      break;
    }
  }
  if (matched === null) return { ok: false, reason: "non_valido" };
  if (options.lastCounter != null && matched <= options.lastCounter) {
    return { ok: false, reason: "riutilizzato" };
  }
  return { ok: true, counter: matched };
}

export function totpUri(
  secret: string,
  email: string,
  issuer = "CRM EffeBi",
): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------------------------------------------------- */
/* Csrf                                                                      */
/* ------------------------------------------------------------------------- */

export function newCsrfToken(): string {
  return randomToken(24);
}
