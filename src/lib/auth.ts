// Session handling: an HMAC-SHA256-signed JSON cookie with expiry.
// Still a prototype (no session store / revocation, SESSION_SECRET must be set
// to a real value in deployment), but no longer forgeable like the old
// unsigned mock cookie.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";

const COOKIE = "linden_session";
const MAX_AGE_S = 60 * 60 * 8;

const secret = () => process.env.SESSION_SECRET || "dev-only-change-me";

interface SessionPayload extends SessionUser {
  exp: number; // unix seconds
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function getSession(): SessionUser | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const data = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  try {
    const expected = Buffer.from(sign(data));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { role: payload.role, id: payload.id, name: payload.name };
  } catch {
    return null;
  }
}

export function setSession(user: SessionUser) {
  const payload: SessionPayload = { ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S };
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  cookies().set(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}
