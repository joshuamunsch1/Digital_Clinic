# LimeSurvey integration: what's possible, what we built, what to decide

Research date: 2026-07-02. Question investigated: *can the platform send a patient a
LimeSurvey link by e-mail (plus reminders), and automatically pull the completed
response back in and score/chart it — or is the realistic path "download from
LimeSurvey, upload here"?*

**Short answer: the fully automated loop is possible.** LimeSurvey ships a JSON-RPC
web-service API ("RemoteControl 2") that covers every step except *instant* push
notification of a completed response — and there are three workable options for that
last step. The manual download→upload path is still worth having (and is implemented)
as the fallback for clinics that use LimeSurvey's hosted free tier, for paper forms,
and for historical data.

## 1. What the RemoteControl 2 API provides

LimeSurvey ≥ 2.0 exposes an XML-RPC/JSON-RPC endpoint (typically
`https://<your-limesurvey>/index.php/admin/remotecontrol`). Relevant calls:

| Step in the desired workflow | API call |
|---|---|
| Authenticate | `get_session_key(username, password)` / `release_session_key` |
| Register the patient as a survey participant (creates a personal token) | `add_participants(surveyId, [{email, firstname, lastname, ...}], createToken=true)` |
| Send the invitation e-mail with their personal link | `invite_participants(surveyId, [tokenIds])` — uses LimeSurvey's own mailer & templates |
| Send reminders to those who haven't finished | `remind_participants(surveyId, minDaysBetween, maxReminders)` |
| Check who has completed | `list_participants(surveyId, ...)` / `get_summary(surveyId)` |
| Pull one patient's answers | `export_responses_by_token(surveyId, 'json', token)` (base64-encoded document) |
| Pull everything | `export_responses(surveyId, 'json' \| 'csv', ...)` |

Notes:
- The API is **disabled by default**; enable it in *Global settings → Interfaces →
  JSON-RPC*.
- Available in the self-hosted **Community Edition** for free. On **LimeSurvey Cloud**
  the RemoteControl API is a plan feature — verify the clinic's plan includes it
  before committing to the hosted route.
- Invitations/reminders can be sent either through LimeSurvey's mailer (the calls
  above) or by the app itself e-mailing the tokenised survey URL
  (`https://<host>/<surveyId>?token=<TOKEN>&lang=de`). Using LimeSurvey's mailer
  means no SMTP configuration in this app.

## 2. Getting completed responses back *immediately*

LimeSurvey does not push webhooks out of the box. Three options, best first:

1. **Webhook plugin** (self-hosted only). LimeSurvey plugins can hook the
   `afterSurveyComplete` event; open-source examples (ZestHook, LimeSurveyWebhook)
   POST the survey id + token to a configurable URL on every submission. Our app
   exposes `POST /api/limesurvey/notify` to receive this and immediately pulls the
   single response via `export_responses_by_token`, scores it, and stores it. This is
   the true "it appears in the chart the moment the patient hits Submit" experience.
2. **End-URL redirect** (works on hosted plans too, no plugin). Each survey's *end
   URL* can be set to
   `https://<this-app>/api/limesurvey/notify?sid={SID}&token={TOKEN}` with "load end
   URL automatically" enabled — the participant's browser pings us on completion and
   the same pull-by-token runs. Caveat: doesn't fire if the participant closes the
   tab at the "thank you" page before the redirect; treat it as best-effort.
3. **Polling** (always works wherever the API works). A "Sync now" action (and/or a
   cron) walks the open invitations and pulls any that LimeSurvey reports complete.
   Implemented as `POST /api/limesurvey/sync`; this is the reliable safety net under
   options 1/2.

Recommended setup: **API invitations + reminders, end-URL ping (or plugin if
self-hosted), and the sync poll as backstop.**

## 3. The manual fallback (implemented regardless)

If the clinic stays on a LimeSurvey tier without API access — or for paper
questionnaires and legacy data — the therapist can:

1. Export responses from LimeSurvey (*Responses → Export → CSV*, with question codes
   as headers), then upload the CSV on the patient's page (choose instrument, rater,
   wave/session); each row becomes a scored response.
2. Or type a questionnaire in directly ("manual entry") using the same generic form
   the patient would see.

## 4. Conventions the integration relies on

- **One LimeSurvey survey per instrument** (per rater variant where applicable —
  e.g. SDQ self vs. SDQ parent are separate surveys, mirroring the legacy
  one-`.sav`-per-instrument layout).
- **Question codes in LimeSurvey must equal the instrument's item ids** in
  `docs/instrument-catalog.json` (e.g. `SDQ1`…`SDQ25`, `BDI1_Traurigkeit`). If a
  survey already exists with different codes, set a mapping on the instrument
  (`limesurveyMapping`, JSON `{ "lsCode": "itemId" }`) instead of renaming.
- Surveys must be **closed-access (token-based), with "anonymized responses" OFF**,
  otherwise responses can't be attributed to a patient.
- Each instrument stores its LimeSurvey survey id (`limesurveySurveyId`); the app's
  invitation UI prompts for it the first time.

Environment variables (see `.env.example`): `LIMESURVEY_URL`,
`LIMESURVEY_USERNAME`, `LIMESURVEY_PASSWORD`. If unset, the invitation UI degrades
gracefully (explains what's missing; CSV/manual import still works).

## 5. Open points to decide with the clinic

- **Hosting**: self-hosted Community Edition (full control, webhook plugin possible,
  but the clinic operates the server) vs. LimeSurvey Cloud (managed, but API
  availability is plan-dependent and plugins can't be installed). This decision picks
  option 1 vs. 2 above.
- **Data protection**: patient names/e-mails go into LimeSurvey's participant table,
  and answers live in LimeSurvey until pulled. Under GDPR/revDSG that makes the
  LimeSurvey operator a processor — needs a DPA, EU/CH hosting, and a
  deletion routine (the API's `delete_participants` / response deletion can automate
  clean-up after import if desired).
- **Reminder policy**: `remind_participants` supports "min days between reminders"
  and "max reminders" — what should the defaults be? (Legacy system had no reminders
  at all.)

Sources: [RemoteControl 2 API — LimeSurvey Manual](https://www.limesurvey.org/manual/RemoteControl_2_API),
[remotecontrol_handle.php (API source)](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/helpers/remotecontrol/remotecontrol_handle.php),
[AfterSurveyComplete plugin event](https://www.limesurvey.org/manual/AfterSurveyComplete),
[ZestHook webhook plugin](https://github.com/evently-nl/zesthook),
[LimeSurveyWebhook plugin](https://github.com/IrishWolf/LimeSurveyWebhook),
[LimeSurvey pricing / plan features](https://www.limesurvey.org/pricing).
