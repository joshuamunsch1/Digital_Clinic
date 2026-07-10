// Next.js instrumentation hook (enabled via experimental.instrumentationHook in
// next.config.mjs) — runs once at server boot, in dev and production alike.
export async function register() {
  // register() is also evaluated for the edge runtime; the scheduler needs Node.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    (await import("./lib/reminder-scheduler")).startReminderScheduler();
  }
}
