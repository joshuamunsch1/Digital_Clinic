// Network restriction for staff data access (see docs + README):
// therapists / the director / administrators may only read or write clinic data
// while on an allowed network (e.g. the university network, directly or via VPN).
// Patients are exempt — they can register, log in and submit their own
// questionnaires from anywhere.
//
// Configure with ALLOWED_NETWORK_CIDRS, a comma-separated list of IPv4 CIDRs,
// e.g. "130.92.0.0/16,10.0.0.0/8"  (placeholder: replace with the university's
// actual ranges). When unset or empty, no restriction applies (dev default).
import { NextResponse } from "next/server";
import type { SessionUser } from "./types";

function ipv4ToInt(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.trim().split("/");
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1"; // local dev has no proxy headers
}

export function onAllowedNetwork(req: Request): boolean {
  const cidrs = (process.env.ALLOWED_NETWORK_CIDRS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!cidrs.length) return true; // unset -> unrestricted (dev / not yet configured)
  const ip = clientIp(req);
  return cidrs.some((c) => inCidr(ip, c));
}

/// Returns a 403 response when a STAFF session is outside the allowed network,
/// or null when the request may proceed. Call at the top of data routes.
export function staffNetworkGuard(session: SessionUser | null, req: Request): NextResponse | null {
  if (!session || session.role === "patient") return null;
  if (onAllowedNetwork(req)) return null;
  return NextResponse.json(
    { error: "network_restricted" },
    { status: 403 },
  );
}
