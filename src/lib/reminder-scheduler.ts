// Background timer for the reminder sweep — started once per server process
// from src/instrumentation.ts (runs in `next dev` and `next start` for as long
// as the server is up). REMINDER_SWEEP_MINUTES tunes the cadence (default 15);
// 0 or a non-number disables it. Manual runs stay available via the monitoring
// view / POST /api/reminders/run regardless.
const globalForScheduler = globalThis as unknown as { reminderSchedulerStarted?: boolean };

export function startReminderScheduler() {
  // dev hot-reload safety, same pattern as the Prisma client in src/lib/db.ts
  if (globalForScheduler.reminderSchedulerStarted) return;
  globalForScheduler.reminderSchedulerStarted = true;

  const raw = process.env.REMINDER_SWEEP_MINUTES;
  const minutes = raw === undefined || raw === "" ? 15 : Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log(`[reminder-scheduler] disabled (REMINDER_SWEEP_MINUTES=${JSON.stringify(raw)})`);
    return;
  }

  const run = async () => {
    try {
      const { runReminderSweep } = await import("./reminder-sweep");
      const result = await runReminderSweep();
      console.log(`[reminder-scheduler] sweep: ${JSON.stringify(result)}`);
    } catch (e) {
      console.error(`[reminder-scheduler] sweep failed: ${(e as Error).message}`);
    }
  };

  // unref() so the timers never keep the process alive on shutdown
  setTimeout(run, 10_000).unref?.();
  setInterval(run, minutes * 60_000).unref?.();
  console.log(`[reminder-scheduler] started — sweep every ${minutes} min`);
}
