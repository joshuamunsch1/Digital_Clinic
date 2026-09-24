// Connection diagnostic for the LimeSurvey RemoteControl-2 integration.
//
//   npm run ls:check              -> credentials + list every survey with its id
//   npm run ls:check -- 123456    -> plus that survey's settings and question codes
//
// Reads LIMESURVEY_URL / LIMESURVEY_USERNAME / LIMESURVEY_PASSWORD from .env
// (parsed here because a plain tsx run, unlike Next.js, does not load .env).
// Everything it reports is read-only: nothing is created, sent or deleted.
//
// See docs/limesurvey-integration.md for what the survey settings must be and
// why the question codes have to line up with the catalog's item ids.
import fs from "node:fs";
import path from "node:path";

/// Minimal KEY="value" / KEY=value reader — enough for this repo's .env, and
/// deliberately not a dependency. Existing process env wins.
function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv(path.join(process.cwd(), ".env"));

const url = (process.env.LIMESURVEY_URL ?? "").replace(/\/+$/, "");
const username = process.env.LIMESURVEY_USERNAME ?? "";
const password = process.env.LIMESURVEY_PASSWORD ?? "";
const endpoint = url ? `${url}/index.php/admin/remotecontrol` : "";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params, id: 1 }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(
      `could not reach ${endpoint}: ${(e as Error).message}\n` +
        "  -> check LIMESURVEY_URL, DNS/firewall, and that the server is up",
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}\n  ${text.slice(0, 300)}`);
  let body: { result?: T; error?: unknown };
  try {
    body = JSON.parse(text) as { result?: T; error?: unknown };
  } catch {
    throw new Error(
      `${endpoint} did not answer with JSON — the RPC interface is probably off.\n` +
        "  -> LimeSurvey: Configuration > Global settings > Interfaces > RPC interface = JSON-RPC\n" +
        `  first bytes: ${text.slice(0, 160)}`,
    );
  }
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result as T;
}

/// Most RemoteControl calls report failure IN the result, as { status: "..." },
/// with HTTP 200 and no JSON-RPC error — e.g. "Error: Invalid survey ID".
/// Returns that status string, or null when the result is real data.
function statusOf(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const st = (result as { status?: unknown }).status;
  return typeof st === "string" ? st : null;
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const wantedSid = process.argv[2];

  console.log("LimeSurvey check");
  console.log(`  endpoint : ${endpoint || "(LIMESURVEY_URL is empty)"}`);
  console.log(`  user     : ${username || "(LIMESURVEY_USERNAME is empty)"}`);
  console.log(`  password : ${password ? `set (${password.length} chars)` : "(LIMESURVEY_PASSWORD is empty)"}`);

  if (!url || !username || !password)
    fail("LIMESURVEY_URL / LIMESURVEY_USERNAME / LIMESURVEY_PASSWORD must all be set in .env");

  const key = await rpc<string>("get_session_key", [username, password]).catch((e: Error) => fail(e.message));
  if (typeof key !== "string")
    fail(`get_session_key returned ${JSON.stringify(key)} instead of a key — wrong username/password, or the account lacks API access`);
  console.log("\n✓ authenticated (session key obtained)");

  try {
    const surveys = await rpc<Array<Record<string, string>>>("list_surveys", [key, username]);
    const visibleIds = Array.isArray(surveys) ? surveys.map((s) => String(s.sid)) : [];
    if (!Array.isArray(surveys) || !surveys.length) {
      console.log("\n! no surveys visible for this account — create one, or grant it survey permissions");
    } else {
      console.log(`\nSurveys visible to ${username}:`);
      for (const s of surveys) {
        const active = s.active === "Y" ? "active" : "NOT ACTIVE";
        console.log(`  sid ${s.sid}  [${active}]  ${s.surveyls_title ?? ""}`);
      }
      console.log("\n  -> the 'sid' is what you type into the Survey-ID field when sending the first invitation");
      console.log("  -> a survey must be ACTIVE and have a participants (token) table before invitations work");
    }

    if (wantedSid) {
      console.log(`\nSurvey ${wantedSid}:`);
      const props = await rpc<Record<string, string>>("get_survey_properties", [key, wantedSid]);
      const propsErr = statusOf(props);
      if (propsErr || !visibleIds.includes(String(wantedSid))) {
        console.log(`  ✗ ${propsErr ?? "not among the surveys listed above"}`);
        console.log(
          visibleIds.length
            ? `      -> no survey ${wantedSid} is visible to ${username}. Use one of: ${visibleIds.join(", ")}\n` +
                `         e.g.  npm run ls:check -- ${visibleIds[0]}`
            : "      -> this account sees no surveys at all",
        );
        return;
      }
      const flag = (ok: boolean) => (ok ? "✓" : "✗");
      console.log(`  ${flag(props.active === "Y")} active       = ${props.active}   (must be Y)`);
      console.log(`  ${flag(props.anonymized === "N")} anonymized   = ${props.anonymized}   (must be N — otherwise answers cannot be matched to a patient)`);
      console.log(`  ${flag(props.autoredirect === "Y")} autoredirect = ${props.autoredirect}   (Y = end URL loads automatically, needed for the completion ping)`);
      // The app's stored fallback link requests &lang=de (surveyUrl in
      // src/lib/limesurvey.ts). The mailed link is built by LimeSurvey itself.
      const langNote =
        props.language === "de" || props.language === "de-informal"
          ? ""
          : `   ! not plain German — "de" (Sie) or "de-informal" (Du) is what the clinic surveys should use`;
      console.log(`    language     = ${props.language}${langNote}`);

      // The end URL lives in the language settings, not the survey table.
      const ls = await rpc<Record<string, string>>("get_language_properties", [
        key, wantedSid, ["surveyls_url"], props.language,
      ]).catch(() => ({}) as Record<string, string>);
      const endUrl = statusOf(ls) ? "" : (ls.surveyls_url ?? "");
      const pingsUs = /\/api\/limesurvey\/notify/.test(endUrl);
      console.log(`  ${flag(pingsUs)} end URL      = ${endUrl || "(not set)"}`);
      if (!pingsUs)
        console.log("      -> set it to https://<this-app>/api/limesurvey/notify?sid={SID}&token={TOKEN}");

      // A participant list (token table) must exist before add_participants
      // works. Positive evidence only: an array = list with participants; a
      // "none found" status = list exists but is empty. The "missing" wording
      // changed across versions ("participants table" / "token table" in <=5,
      // "participant list" in 6), so anything else is reported verbatim rather
      // than guessed at.
      const participants = await rpc<unknown>("list_participants", [key, wantedSid, 0, 1]);
      const pStatus = statusOf(participants);
      if (Array.isArray(participants) || (pStatus && /no (survey )?(participants|tokens) found/i.test(pStatus))) {
        console.log("  ✓ participant list present");
      } else if (pStatus && /participant list|participants table|token table/i.test(pStatus)) {
        console.log(`  ✗ participant list MISSING  ("${pStatus}")`);
        console.log("      -> every invitation will fail until it exists. In LimeSurvey: open the survey,");
        console.log("         top toolbar 'Survey participants', then the button that switches the survey to");
        console.log("         closed-access mode ('Switch to closed-access mode' / older: 'Initialise participant table').");
      } else {
        console.log(`  ? participant list: could not tell — LimeSurvey said ${JSON.stringify(pStatus ?? participants)}`);
      }

      const questions = await rpc<Array<Record<string, string>>>("list_questions", [key, wantedSid]);
      const qStatus = statusOf(questions);
      if (qStatus) {
        console.log(`  ! could not list questions: ${qStatus}`);
      } else if (!Array.isArray(questions) || !questions.length) {
        console.log("  ! no questions found");
      } else {
        console.log(`\n  Question codes (${questions.length}) — these must equal the catalog item ids,`);
        console.log("  or be mapped with the 'Fragencode-Zuordnung' editor in the send form:");
        for (const q of questions) console.log(`    ${q.title}   (qid ${q.qid}, type ${q.type})`);
        console.log("\n  -> an ARRAY question exports as CODE[SUBCODE]; its subquestion codes are not listed");
        console.log("     here, so check one real response (or the CSV export headers) before you rely on it");
        console.log("  -> answer CODES must be the numeric item values (0/1/2/3 …): the importer asks");
        console.log("     LimeSurvey for codes, not answer texts, and scores them as numbers");
      }
    } else {
      console.log("\n  (pass a survey id to inspect its settings and question codes: npm run ls:check -- <sid>)");
    }
  } finally {
    await rpc("release_session_key", [key]).catch(() => undefined);
  }
  console.log("");
}

main().catch((e: Error) => fail(e.message));
