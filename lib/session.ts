import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "mhs_session";
const ALG = "HS256";

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set (32+ characters)");
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(): Promise<string> {
  return await new SignJWT({ ok: 1 })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
