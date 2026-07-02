// LimeSurvey RemoteControl 2 client (JSON-RPC). See docs/limesurvey-integration.md
// for what the API can and cannot do and how surveys must be set up.
//
// Configured via env: LIMESURVEY_URL (base URL of the LimeSurvey installation),
// LIMESURVEY_USERNAME, LIMESURVEY_PASSWORD. When unset, the app falls back to
// manual CSV import / manual entry and the UI explains what is missing.

interface LsConfig {
  url: string;
  username: string;
  password: string;
}

export function limesurveyConfig(): LsConfig | null {
  const url = process.env.LIMESURVEY_URL;
  const username = process.env.LIMESURVEY_USERNAME;
  const password = process.env.LIMESURVEY_PASSWORD;
  if (!url || !username || !password) return null;
  return { url: url.replace(/\/+$/, ""), username, password };
}

export const limesurveyConfigured = () => limesurveyConfig() !== null;

export class LimesurveyError extends Error {}

async function rpc<T>(cfg: LsConfig, method: string, params: unknown[]): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${cfg.url}/index.php/admin/remotecontrol`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params, id: 1 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new LimesurveyError(`LimeSurvey HTTP ${res.status} for ${method}`);
    const body = (await res.json()) as { result: T; error: unknown };
    if (body.error) throw new LimesurveyError(`LimeSurvey ${method}: ${JSON.stringify(body.error)}`);
    // Several calls report failures inside result, e.g. { status: "Error: ..." }
    const r = body.result as { status?: string } | T;
    if (r && typeof r === "object" && "status" in (r as object)) {
      const status = (r as { status?: string }).status;
      if (typeof status === "string" && /error|invalid|no permission|no survey/i.test(status)) {
        throw new LimesurveyError(`LimeSurvey ${method}: ${status}`);
      }
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

async function withSession<T>(cfg: LsConfig, fn: (key: string) => Promise<T>): Promise<T> {
  const key = await rpc<string>(cfg, "get_session_key", [cfg.username, cfg.password]);
  if (typeof key !== "string") throw new LimesurveyError("could not obtain a session key — check credentials");
  try {
    return await fn(key);
  } finally {
    rpc(cfg, "release_session_key", [key]).catch(() => undefined);
  }
}

export interface LsParticipant {
  tid: string;
  token: string;
}

/// Register one participant on a survey's token table; returns their token.
export async function addParticipant(
  surveyId: string,
  p: { email: string; firstname: string; lastname: string },
): Promise<LsParticipant> {
  const cfg = limesurveyConfig();
  if (!cfg) throw new LimesurveyError("LimeSurvey is not configured");
  return withSession(cfg, async (key) => {
    const result = await rpc<Array<{ tid?: string | number; token?: string; errors?: unknown }>>(
      cfg,
      "add_participants",
      [key, surveyId, [p], true],
    );
    const first = Array.isArray(result) ? result[0] : undefined;
    if (!first?.token) throw new LimesurveyError(`add_participants returned no token: ${JSON.stringify(result)}`);
    return { tid: String(first.tid), token: first.token };
  });
}

/// Send the invitation e-mail through LimeSurvey's own mailer.
export async function inviteParticipant(surveyId: string, tokenId: string): Promise<void> {
  const cfg = limesurveyConfig();
  if (!cfg) throw new LimesurveyError("LimeSurvey is not configured");
  await withSession(cfg, (key) => rpc(cfg, "invite_participants", [key, surveyId, [tokenId], true]));
}

/// Send a reminder e-mail (only reaches participants who have not completed).
export async function remindParticipant(surveyId: string, tokenId: string): Promise<void> {
  const cfg = limesurveyConfig();
  if (!cfg) throw new LimesurveyError("LimeSurvey is not configured");
  await withSession(cfg, (key) => rpc(cfg, "remind_participants", [key, surveyId, 0, 10, [tokenId]]));
}

/// Direct tokenised survey URL (what the invitation e-mail links to).
export function surveyUrl(baseUrl: string, surveyId: string, token: string, lang = "de"): string {
  return `${baseUrl.replace(/\/+$/, "")}/index.php/${surveyId}?token=${encodeURIComponent(token)}&lang=${lang}`;
}

/// Fetch one completed response by participant token. Returns the raw field map
/// (question codes -> values, plus metadata like submitdate) or null when the
/// participant has not completed yet.
export async function exportResponseByToken(
  surveyId: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const cfg = limesurveyConfig();
  if (!cfg) throw new LimesurveyError("LimeSurvey is not configured");
  return withSession(cfg, async (key) => {
    let encoded: string;
    try {
      encoded = await rpc<string>(cfg, "export_responses_by_token", [
        key, surveyId, "json", token, null, "complete", "code", "long",
      ]);
    } catch (e) {
      // "No Response found for Token" is the normal not-finished-yet case
      if (e instanceof LimesurveyError && /no response|no data/i.test(e.message)) return null;
      throw e;
    }
    if (typeof encoded !== "string") return null;
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { responses?: unknown };
    const responses = Array.isArray(parsed.responses) ? parsed.responses : [];
    if (!responses.length) return null;
    // Depending on version, entries are either flat objects or { "<id>": {...} }
    const first = responses[responses.length - 1] as Record<string, unknown>;
    const keys = Object.keys(first);
    if (keys.length === 1 && typeof first[keys[0]] === "object" && first[keys[0]] !== null) {
      return first[keys[0]] as Record<string, unknown>;
    }
    return first;
  });
}
