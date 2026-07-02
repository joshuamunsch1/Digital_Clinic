// MOCK session handling. NOT production auth — replace with a real identity
// provider (e.g. Auth.js / an OIDC IdP) before handling real patient data.
import { cookies } from "next/headers";
import type { SessionUser } from "./types";

const COOKIE = "linden_session";

export function getSession(): SessionUser | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(user: SessionUser) {
  const value = Buffer.from(JSON.stringify(user), "utf8").toString("base64");
  cookies().set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}
