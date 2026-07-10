import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { runReminderSweep } from "@/lib/reminder-sweep";

/// Run the reminder sweep now (sync completions + send due reminders).
/// Authorized for staff sessions, or — for an external cron — via the
/// x-reminder-secret header matching REMINDER_SWEEP_SECRET. When LimeSurvey is
/// unconfigured this returns 200 with { skipped }, not an error, so the
/// monitoring view's button degrades to an informative message.
export async function POST(req: Request) {
  const secret = process.env.REMINDER_SWEEP_SECRET;
  const viaSecret = !!secret && req.headers.get("x-reminder-secret") === secret;
  if (!viaSecret) {
    const s = getSession();
    if (!s || (s.role !== "director" && s.role !== "therapist"))
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const restricted = staffNetworkGuard(s, req);
    if (restricted) return restricted;
  }
  return NextResponse.json(await runReminderSweep());
}
