// DIPS Open Access 1.2 — anxiety section (Margraf, Cwik, von Brachel, Suppiger
// & Schneider, 2021; doi 10.46586/rub.172.149), structure checked against the
// Interviewleitfaden pp. 18–77 and the Protokollbogen pp. 297–311:
//   • `code` is the official item number; `req` mirrors the star (*) that
//     marks items indispensable for the diagnosis.
//   • Item ids are storage keys and predate the alignment — where they differ
//     from the official number (phobia "3" = *4.1, sep "4.1" = the child
//     extension) the id stayed and only the displayed code changed.
//   • Wording is condensed, not verbatim; unstarred items that only deepen
//     the exploration (social 8, GAD 2.1/2.2 and 8.2, the "Geschichte"
//     sub-questions) are folded into free-text fields or left out.
//   • Skip rules ("Sprungregeln") are applied where they are unambiguous
//     (screening, lifetime branch, conditional follow-ups). The discretionary
//     ones ("falls eindeutig keine Hinweise …") are NOT auto-applied: the
//     form keeps asking and the evaluation in diagnosis.ts decides.
import { L, T, tr, type LangNode } from "../i18n";
import { PALETTE } from "../theme";
import type { ModuleAnswers } from "../types";
import type { DipsModule, GridCol, GridGroup, GridRow, Item, Pred, Section, TailKey, TailOptions } from "./types";

/* shared rating notes for the checklists */
const GRID_NOTE = L(
  "Geben Sie für jede Situation an, ob Angst besteht; falls ja, erscheinen Vermeidung und Stärke (0–3).",
  "Pour chaque situation, indiquez s'il y a de la peur ; si oui, l'évitement et l'intensité (0–3) apparaissent.",
  "For each situation, indicate whether there is fear; if so, avoidance and intensity (0–3) appear.",
);
const SYMPTOM_NOTE = L(
  "Geben Sie für jedes Symptom an, ob es vorhanden ist; falls ja, kann der Schweregrad (0–3) eingeschätzt werden.",
  "Pour chaque symptôme, indiquez s'il est présent ; si oui, la sévérité (0–3) peut être évaluée.",
  "For each symptom, indicate whether it is present; if so, its severity (0–3) can be rated.",
);

/* fear/avoidance checklist follow-ups (shown when fear = yes): the starred
   avoidance column, then the optional combined 0–3 rating */
const COLS_FEAR_AVOID: GridCol[] = [
  { key: "avoid", kind: "yesno", req: true, label: L("Vermeidung?", "Évitement ?", "Avoidance?") },
  { key: "sev", kind: "sev03", label: L("Schweregrad (0–3)", "Sévérité (0–3)", "Severity (0–3)") },
];

const OTHER = (key: string): GridRow => ({ key, specify: true, label: L("Andere", "Autres", "Other") });

/* Organic rule-out examples as listed in the DIPS (the agoraphobia section
   names gastrointestinal/neurological conditions, every other section the
   same five). */
const ORGANIC_DEFAULT = L(
  "Mittelohrentzündung, Schilddrüsenprobleme, Schwangerschaft, niedriger Blutzucker, Mitralklappenprolaps",
  "otite moyenne, problèmes de thyroïde, grossesse, hypoglycémie, prolapsus mitral",
  "middle-ear infection, thyroid problems, pregnancy, low blood sugar, mitral valve prolapse",
);
const ORGANIC_AGORA = L(
  "Morbus Crohn, Colitis ulcerosa, Morbus Parkinson",
  "maladie de Crohn, rectocolite hémorragique, maladie de Parkinson",
  "Crohn's disease, ulcerative colitis, Parkinson's disease",
);

const codeKey = (code: string) => code.split(".").map(Number);
const byCode = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

/* shared module "tail": exclusions, onset/duration, history, appropriateness,
   impairment, earlier phases — numbered and starred per module */
function mkTail(opts: TailOptions): Section {
  const { enter, codes } = opts;
  const entries: { item: Item; at: number[] }[] = [];
  const add = (key: TailKey, item: Omit<Item, "id" | "code" | "req">, showIf: Pred = enter) => {
    const code = codes[key];
    if (!code) return;
    entries.push({ item: { ...item, id: key, code, req: opts.starred.includes(key) || undefined, showIf }, at: codeKey(code) });
  };

  if (opts.cognition) add("cog", { type: "textarea", q: opts.cognition });
  if (opts.coping) add("cope", { type: "textarea", q: opts.coping });
  if (opts.first)
    add("first", {
      type: "yesno_text", q: opts.first,
      describe: L("Wo? Mit wem? Wie fing es an? Was taten Sie?", "Où ? Avec qui ? Comment cela a-t-il commencé ? Qu'avez-vous fait ?", "Where? With whom? How did it start? What did you do?"),
    });

  add("subst1", {
    type: "yesno_text",
    q: L("Nahmen Sie unmittelbar vor oder seit Beginn dieser Symptome Medikamente oder Drogen (einschließlich Koffein) oder tranken Sie ungewöhnlich viel Alkohol?", "Avez-vous pris des médicaments ou des drogues (y compris de la caféine) juste avant ou depuis le début de ces symptômes, ou bu une quantité inhabituelle d'alcool ?", "Did you take medications or drugs (including caffeine) immediately before or since these symptoms began, or drink unusually large amounts of alcohol?"),
    describe: L("Art, Dosis, Zeitpunkt Einnahme/Absetzen", "Type, dose, moment de la prise/de l'arrêt", "Type, dose, time of intake/discontinuation"),
  });
  const usesSubstance: Pred = (m) => enter(m) && m["subst1"] === "yes";
  add("subst2", {
    type: "yesno",
    q: L("Verursacht die Einnahme oder der Entzug von Medikamenten, Drogen oder Alkohol möglicherweise die Symptome?", "La prise ou le sevrage de médicaments, de drogues ou d'alcool pourrait-il être à l'origine des symptômes ?", "Could the use or withdrawal of medications, drugs, or alcohol possibly cause the symptoms?"),
  }, usesSubstance);
  if (codes.subst1) {
    const at = codeKey(codes.subst1);
    entries.push({
      item: { id: "subst_head", type: "subhead", showIf: enter, q: L("Ausschluss von Substanzeffekten", "Exclusion d'effets de substances", "Exclusion of substance effects") },
      at: [...at.slice(0, -1), at[at.length - 1] - 0.5],
    });
    // Unnumbered follow-up between the two substance items.
    entries.push({
      item: { id: "subst_cur", type: "yesno", showIf: usesSubstance, q: L("Nehmen Sie diese Substanzen aktuell noch ein?", "Prenez-vous encore ces substances actuellement ?", "Are you currently still taking these substances?") },
      at: [...at.slice(0, -1), at[at.length - 1] + 0.5],
    });
  }
  add("organic", {
    type: "yesno_text",
    q: L(
      `Ausschluss organischer Ursachen: Lagen kurz bevor die Symptomatik begonnen hat oder seitdem sie besteht besondere körperliche Bedingungen oder Erkrankungen vor (z. B. ${tr(opts.organic, "de")}), die die Symptome verursacht haben könnten?`,
      `Exclusion de causes organiques : peu avant le début des symptômes ou depuis qu'ils persistent, y avait-il des conditions ou maladies physiques particulières (p. ex. ${tr(opts.organic, "fr")}) susceptibles de les avoir causés ?`,
      `Exclusion of organic causes: shortly before the symptoms began, or since they have persisted, were there particular physical conditions or illnesses (e.g. ${tr(opts.organic, "en")}) that may have caused them?`,
    ),
    describe: L("Welche?", "Lesquelles ?", "Which?"),
  });
  add("onset_age", {
    type: "number_label",
    q: L("Wie alt waren Sie, als Sie erstmals durch diese Angst belastet und im Alltag beeinträchtigt wurden?", "Quel âge aviez-vous lorsque cette peur vous a affecté(e) et gêné(e) au quotidien pour la première fois ?", "How old were you when this fear first distressed you and impaired your daily life?"),
    unit: L("Beginn (Lebensalter)", "Début (âge)", "Onset (age)"),
    max: 120,
  });
  add("since", { type: "date", q: SINCE_Q });
  add("dur6", { type: "yesno", q: DUR6_Q });
  add("hist1", {
    type: "yesno_text",
    q: L("Erinnern Sie sich an etwas, das dazu beigetragen haben könnte, dass Sie diese Angst zum ersten Mal erlebten?", "Vous souvenez-vous de quelque chose qui aurait pu contribuer à la première apparition de cette peur ?", "Do you recall anything that may have contributed to your first experiencing this fear?"),
  });
  add("hist2", {
    type: "yesno_text",
    q: L("Standen Sie in dieser Zeit unter Belastung (z. B. Schwierigkeiten mit Familie/Freund*innen, Beruf/Schule, Gesundheit, Finanzen, juristische Angelegenheiten)?", "Étiez-vous sous tension à cette période (p. ex. difficultés avec la famille/les amis, le travail/l'école, la santé, les finances, des questions juridiques) ?", "Were you under stress at that time (e.g. difficulties with family/friends, work/school, health, finances, legal matters)?"),
  });
  // Not put to the patient: the interviewer judges proportionality (the DSM-5
  // "out of proportion" criterion). "Nein" = the fear is disproportionate.
  add("approp", {
    type: "yesno",
    q: L(
      "Abklärung der Angemessenheit (Einschätzung Therapeut*in): Ist die beschriebene Angst in diesen Situationen (soziokulturell) angemessen?",
      "Évaluation du caractère approprié (jugement du/de la thérapeute) : la peur décrite est-elle appropriée (au contexte socioculturel) dans ces situations ?",
      "Appropriateness (therapist's judgement): is the described fear appropriate (to the sociocultural context) in these situations?",
    ),
  });
  add("impact", {
    type: "dual_scale",
    q: L("Wie stark beeinträchtigen Sie diese Ängste/Vermeidung in Ihrem Leben, und wie stark belasten sie Sie?", "Dans quelle mesure ces peurs/évitements nuisent-ils à votre vie, et à quel point vous affectent-ils ?", "How strongly do these fears/avoidance impair your life, and how distressed are you by them?"),
    help: L(
      "0 = gar nicht · 2 = schwach · 4 = mäßig · 6 = schwer · 8 = sehr schwer (≥ 4 gilt als klinisch relevant)",
      "0 = pas du tout · 2 = faible · 4 = modéré · 6 = sévère · 8 = très sévère (≥ 4 = cliniquement pertinent)",
      "0 = not at all · 2 = slight · 4 = moderate · 6 = severe · 8 = very severe (≥ 4 is considered clinically relevant)",
    ),
    parts: [
      { key: "impair", label: L("Beeinträchtigung", "Altération", "Impairment") },
      { key: "distress", label: L("Belastung", "Détresse", "Distress") },
    ],
  });
  add("earlier", {
    type: "yesno_text",
    q: L("Gab es neben dieser aktuellen Phase schon frühere Phasen, in denen es Ihnen ähnlich erging?", "En dehors de cette période actuelle, y a-t-il eu des périodes antérieures similaires ?", "Apart from this current phase, have there been earlier phases in which you felt similarly?"),
    describe: L("Daten früherer Phasen", "Dates des périodes antérieures", "Dates of earlier phases"),
  });
  for (const it of opts.extra ?? [])
    entries.push({ item: { ...it, showIf: (m) => enter(m) && (it.showIf ? it.showIf(m) : true) }, at: codeKey(it.code!) });

  entries.sort((a, b) => byCode(a.at, b.at));
  const items: Item[] = [
    { id: "tail_head", type: "subhead", showIf: enter, q: L("Weitere Angaben", "Informations complémentaires", "Further details") },
    ...entries.map((e) => e.item),
    // DIPS "Klinische Einschätzungen und Diagnosen": the interviewer rates the
    // severity of every diagnosis on 0–8; 0–3 is the subclinical, 4–8 the
    // clinical range, and the primary diagnosis is the most severe one.
    // Optional per module; diagnosis.ts explains how it enters the evaluation.
    {
      id: "clinsev", type: "dual_scale", showIf: enter,
      q: L(
        "Klinische Schweregrad-Einschätzung der Diagnose (durch Therapeut*in)",
        "Évaluation clinique de la sévérité du diagnostic (par le/la thérapeute)",
        "Clinical severity rating of the diagnosis (by the therapist)",
      ),
      help: L(
        "0–3 subklinisch (2 = leicht störend/behindernd) · 4 = deutlich · 6 = stark · 8 = sehr stark störend/behindernd (klinischer Bereich ab 4)",
        "0–3 subclinique (2 = légèrement gênant/invalidant) · 4 = nettement · 6 = fortement · 8 = très fortement gênant/invalidant (domaine clinique à partir de 4)",
        "0–3 subclinical (2 = mildly disturbing/disabling) · 4 = definitely · 6 = markedly · 8 = very severely disturbing/disabling (clinical range from 4)",
      ),
      parts: [{ key: "sev", label: L("Schweregrad", "Sévérité", "Severity") }],
    },
  ];
  return { id: "tail", title: L("Weitere Angaben", "Informations complémentaires", "Further details"), items };
}

const SINCE_Q = L("Seit wann treten diese Angst und das Vermeidungsverhalten auf? Beginn (Mt./J.)", "Depuis quand cette peur et l'évitement surviennent-ils ? Début (mois/année)", "Since when have this fear and the avoidance been occurring? Onset (mo./yr.)");
const DUR6_Q = L("Dauern diese Angst und das Vermeidungsverhalten mindestens 6 Monate an?", "Cette peur et l'évitement durent-ils au moins 6 mois ?", "Have this fear and the avoidance lasted at least 6 months?");
const FEARED_SYMPTOMS = L("Welche Symptome befürchten Sie?", "Quels symptômes redoutez-vous ?", "Which symptoms do you fear?");

/* ---- list data ---- */
export const PANIC_SYMPTOMS: { key: string; label: LangNode }[] = [
  { key: "s1", label: L("Herzklopfen, Herzrasen oder beschleunigter Herzschlag?", "Palpitations, battements de cœur ou accélération du rythme cardiaque ?", "Palpitations, pounding heart, or accelerated heart rate?") },
  { key: "s2", label: L("Schwitzen?", "Transpiration (sueurs) ?", "Sweating?") },
  { key: "s3", label: L("Zittern oder Beben?", "Tremblements ou secousses ?", "Trembling or shaking?") },
  { key: "s4", label: L("Kurzatmigkeit oder Atemnot?", "Souffle coupé ou impression d'étouffement ?", "Shortness of breath or smothering?") },
  { key: "s5", label: L("Erstickungsgefühle?", "Sensation d'étranglement ?", "Feelings of choking?") },
  { key: "s6", label: L("Schmerzen oder Beklemmung in der Brust?", "Douleur ou gêne thoracique ?", "Chest pain or discomfort?") },
  { key: "s7", label: L("Übelkeit oder Magen-Darm-Beschwerden?", "Nausée ou gêne abdominale ?", "Nausea or abdominal distress?") },
  { key: "s8", label: L("Schwindel, Unsicherheit, Benommenheit oder Ohnmachtsnähe?", "Vertige, instabilité, tête vide ou évanouissement imminent ?", "Dizziness, unsteadiness, light-headedness, or feeling faint?") },
  { key: "s9", label: L("Gefühle der Unwirklichkeit oder des Losgelöst-Seins?", "Déréalisation ou dépersonnalisation ?", "Unreality (derealization) or detachment (depersonalization)?") },
  { key: "s10", label: L("Angst, die Kontrolle zu verlieren oder verrückt zu werden?", "Peur de perdre le contrôle ou de devenir fou/folle ?", "Fear of losing control or going crazy?") },
  { key: "s11", label: L("Angst zu sterben?", "Peur de mourir ?", "Fear of dying?") },
  { key: "s12", label: L("Taubheit oder Kribbeln in Körperteilen?", "Engourdissements ou picotements ?", "Numbness or tingling?") },
  { key: "s13", label: L("Hitzewallungen oder Kälteschauer?", "Bouffées de chaleur ou frissons ?", "Chills or heat sensations?") },
];

// The five situation areas of the DIPS checklist (Protokollbogen A1–A5), each
// closed by an "Andere" row. "Allein zu Hause sein" is item 3.15 inside
// "Geschlossene Räume" there, so it counts toward that area.
const AGORA_SITUATIONS: GridGroup[] = [
  { title: L("(Öffentliche) Verkehrsmittel", "Transports (publics)", "(Public) transport"), rows: [
    { key: "car", label: L("Autofahren", "Conduire", "Driving") }, { key: "bus", label: L("Busfahren", "Prendre le bus", "Bus") },
    { key: "train", label: L("Zugfahren", "Prendre le train", "Train") }, { key: "ship", label: L("Schifffahren", "Bateau", "Boat") }, { key: "fly", label: L("Fliegen", "Avion", "Flying") },
    OTHER("othertransport")] },
  { title: L("Öffentliche Plätze", "Lieux publics ouverts", "Open public spaces"), rows: [
    { key: "park", label: L("Parkplätze", "Parkings", "Car parks") }, { key: "market", label: L("Marktplätze", "Places de marché", "Marketplaces") }, { key: "bridge", label: L("Brücken", "Ponts", "Bridges") },
    OTHER("otherplace")] },
  { title: L("Geschlossene Räume", "Lieux clos", "Enclosed places"), rows: [
    { key: "cinema", label: L("Kino, Theater", "Cinéma, théâtre", "Cinema, theatre") }, { key: "shops", label: L("Geschäfte / Supermärkte", "Magasins / supermarchés", "Shops / supermarkets") },
    { key: "lift", label: L("Fahrstühle / Lifte", "Ascenseurs", "Lifts / elevators") }, { key: "tunnel", label: L("Geschlossene, enge Räume, Tunnel", "Espaces clos étroits, tunnels", "Closed narrow spaces, tunnels") },
    { key: "alonehome", label: L("Allein zu Hause sein", "Être seul(e) à la maison", "Being alone at home") },
    OTHER("otherenclosed")] },
  { title: L("Menschenmengen", "Foules / files d'attente", "Crowds / queues"), rows: [
    { key: "queue", label: L("Schlange stehen", "Faire la queue", "Standing in line") }, { key: "crowd", label: L("Menschenansammlungen", "Rassemblements", "Crowds") },
    OTHER("othercrowd")] },
  { title: L("Draußen alleine sein", "Être seul(e) dehors", "Being outside alone"), rows: [
    { key: "outside", label: L("Aus dem Haus gehen", "Sortir de chez soi", "Leaving the house") },
    OTHER("otheroutside")] },
];

const SOCIAL_SITUATIONS: GridGroup[] = [
  { title: L("Soziale & Leistungssituationen", "Situations sociales et de performance", "Social & performance situations"), rows: [
    { key: "party", label: L("Partys", "Fêtes", "Parties") }, { key: "meet", label: L("Treffen, Zusammenkünfte, Tagungen, Schule", "Réunions, rencontres, école", "Meetings, gatherings, school") },
    { key: "eat", label: L("Essen in der Öffentlichkeit", "Manger en public", "Eating in public") }, { key: "toilet", label: L("Öffentliche Toiletten benutzen", "Toilettes publiques", "Using public toilets") },
    { key: "talkfam", label: L("Mit vertrauten Personen sprechen", "Parler à des proches", "Talking to familiar people") }, { key: "speak", label: L("Vor einer Gruppe / förmlich sprechen", "Parler devant un groupe", "Speaking before a group") },
    { key: "perform", label: L("Auftritte", "Se produire en public", "Performing") }, { key: "talkstranger", label: L("Mit unvertrauten Personen sprechen", "Parler à des inconnus", "Talking to unfamiliar people") },
    { key: "write", label: L("Vor anderen schreiben (unterschreiben, Formulare)", "Écrire devant les autres (signer, formulaires)", "Writing in front of others (signing, forms)") }, { key: "date", label: L("Rendezvous, Verabredungen", "Rendez-vous", "Dates") },
    { key: "authority", label: L("Mit Autoritätspersonen sprechen", "Parler à des figures d'autorité", "Talking to authority figures") },
    { key: "assert", label: L("Selbstsicher auftreten: unvernünftige Ansprüche zurückweisen", "S'affirmer : refuser des demandes déraisonnables", "Being assertive: refusing unreasonable demands") },
    { key: "assert2", label: L("Selbstsicher auftreten: andere bitten, ihr Verhalten zu ändern", "S'affirmer : demander aux autres de changer de comportement", "Being assertive: asking others to change their behaviour") },
    { key: "startconv", label: L("Ein Gespräch beginnen", "Engager une conversation", "Starting a conversation") }, { key: "keepconv", label: L("Ein Gespräch aufrechterhalten", "Maintenir une conversation", "Maintaining a conversation") },
    { key: "examoral", label: L("Mündliche Prüfungen", "Examens oraux", "Oral exams") }, { key: "examwritten", label: L("Schriftliche Prüfungen", "Examens écrits", "Written exams") },
    { key: "other1", specify: true, label: L("Andere Situation 1", "Autre situation 1", "Other situation 1") },
    { key: "other2", specify: true, label: L("Andere Situation 2", "Autre situation 2", "Other situation 2") }] },
];
/// Rows behind the DSM-5 "performance only" specifier (speaking/performing in
/// front of others, exams).
export const SOCIAL_PERFORMANCE_ROWS = ["speak", "perform", "examoral", "examwritten"];

const PHOBIA_TYPES: GridGroup[] = [
  { title: L("Tiere", "Animaux", "Animals"), rows: [
    { key: "animal1", specify: true, label: L("Tier 1 (z. B. Spinnen, Schlangen, Insekten, Hunde)", "Animal 1 (p. ex. araignées, serpents, insectes, chiens)", "Animal 1 (e.g. spiders, snakes, insects, dogs)") },
    { key: "animal2", specify: true, label: L("Tier 2", "Animal 2", "Animal 2") }] },
  { title: L("Umwelt", "Environnement naturel", "Natural environment"), rows: [
    { key: "heights", label: L("Höhen", "Hauteurs", "Heights") }, { key: "storms", label: L("Stürme", "Orages", "Storms") }, { key: "water", label: L("Wasser", "Eau", "Water") },
    { key: "otherenv", specify: true, label: L("Sonstige Umwelt", "Autre (environnement)", "Other (environment)") }] },
  { title: L("Blut, Spritzen, Verletzungen", "Sang, injections, blessures", "Blood, injections, injuries"), rows: [
    { key: "blood", label: L("Blut sehen", "Voir du sang", "Seeing blood") }, { key: "injection", label: L("Eine Spritze erhalten (selbst/jemand anderes)", "Recevoir une injection (soi-même/autrui)", "An injection (self/someone else)") }, { key: "draw", label: L("Blut abgenommen bekommen (selbst/jemand anderes)", "Prise de sang (soi-même/autrui)", "Having blood drawn (self/someone else)") }] },
  { title: L("Situativ", "Situationnel", "Situational"), rows: [
    { key: "planes", label: L("Flugzeuge", "Avions", "Aeroplanes") }, { key: "elevators", label: L("Aufzüge", "Ascenseurs", "Lifts") }, { key: "enclosed", label: L("Enge geschlossene Räume", "Espaces clos étroits", "Narrow enclosed spaces") },
    { key: "othersit", specify: true, label: L("Sonstige Situationen", "Autres situations", "Other situations") }] },
  { title: L("Sonstiges", "Autres", "Other"), rows: [
    { key: "dental", label: L("Medizinische / zahnärztliche Behandlungen", "Soins médicaux / dentaires", "Medical / dental procedures") }, { key: "choke", label: L("Sich verschlucken, ersticken", "S'étouffer", "Choking") },
    { key: "vomit", label: L("Erbrechen", "Vomir", "Vomiting") }, { key: "infect", label: L("Sich anstecken", "Être contaminé(e)", "Becoming infected") },
    { key: "other", specify: true, label: L("Sonstiges", "Autre", "Other") }] },
];

const GAD_WORRIES: GridGroup[] = [
  { title: L("Sorgenbereiche", "Domaines d'inquiétude", "Worry domains"), rows: [
    { key: "family", label: L("Familie", "Famille", "Family") }, { key: "work", label: L("Arbeit oder Ausbildung", "Travail ou formation", "Work or education") },
    { key: "finance", label: L("Finanzen", "Finances", "Finances") }, { key: "ownhealth", label: L("Eigene Gesundheit", "Sa propre santé", "Own health") },
    { key: "otherhealth", label: L("Gesundheit nahestehender Personen", "Santé des proches", "Health of loved ones") }, { key: "social", label: L("Soziale / zwischenmenschliche Themen", "Sujets sociaux / relationnels", "Social / interpersonal matters") },
    { key: "minor", label: L("Kleinere Angelegenheiten, alltägliche Probleme", "Petites affaires, problèmes du quotidien", "Minor matters, everyday problems") }, { key: "society", label: L("Gesellschaft / Weltgeschehen", "Société / actualité mondiale", "Society / world events") },
    { key: "other1", specify: true, label: L("Sonstiges 1", "Autre 1", "Other 1") }, { key: "other2", specify: true, label: L("Sonstiges 2", "Autre 2", "Other 2") }] },
];
export const GAD_SYMPTOMS = [
  { key: "restless", label: L("Ruhelosigkeit, Nervosität", "Agitation, nervosité", "Restlessness, nervousness") },
  { key: "fatigue", label: L("Leichte Ermüdbarkeit", "Fatigabilité", "Being easily fatigued") },
  { key: "concentration", label: L("Konzentrationsschwierigkeiten oder plötzliches Vergessen", "Difficultés de concentration ou oublis soudains", "Difficulty concentrating or suddenly forgetting things") },
  { key: "irritable", label: L("Reizbarkeit", "Irritabilité", "Irritability") },
  { key: "tension", label: L("Muskelspannung", "Tension musculaire", "Muscle tension") },
  { key: "sleep", label: L("Schlafprobleme (ein-/durchschlafen, unruhig)", "Troubles du sommeil", "Sleep problems (falling/staying asleep, restless)") },
];
export const SEP_SYMPTOMS = [
  { key: "sep1", label: L("Furcht, von zu Hause oder einer wichtigen Bezugsperson getrennt zu sein", "Peur d'être séparé(e) du domicile ou d'une figure d'attachement", "Fear of being separated from home or an attachment figure") },
  { key: "sep2", label: L("Furcht, eine wichtige Bezugsperson zu verlieren oder dass ihr etwas zustößt", "Peur de perdre une figure d'attachement ou qu'il lui arrive malheur", "Fear of losing an attachment figure or that harm befalls them") },
  { key: "sep3", label: L("Furcht, dass ein Ereignis zu einer plötzlichen Trennung führt", "Peur qu'un événement entraîne une séparation soudaine", "Fear that an event leads to sudden separation") },
  { key: "sep4", label: L("Furcht, aus dem Haus zu gehen (Schule, Arbeit, anderswohin)", "Peur de sortir (école, travail, ailleurs)", "Fear of leaving home (school, work, elsewhere)") },
  { key: "sep5", label: L("Furcht, allein ohne wichtige Bezugsperson zu sein", "Peur d'être seul(e) sans figure d'attachement", "Fear of being alone without an attachment figure") },
  { key: "sep6", label: L("Furcht, woanders oder ohne Bezugsperson zu schlafen", "Peur de dormir ailleurs ou sans figure d'attachement", "Fear of sleeping away or without an attachment figure") },
  { key: "sep7", label: L("Albträume über Trennungssituationen", "Cauchemars de séparation", "Nightmares about separation") },
  { key: "sep8", label: L("Körperliche Symptome bei (befürchteter) Trennung", "Symptômes physiques lors d'une séparation (redoutée)", "Physical symptoms on (anticipated) separation") },
];

/* ---- predicates ----
   Every "früher" (lifetime) branch is only reachable once the current-phase
   question (1.1) is answered "Nein", exactly as the interview routes it — so
   answers left over from a corrected screening question can never keep a
   module entered. */
const yes = (m: ModuleAnswers, k: string) => m[k] === "yes";
const notCurrent = (m: ModuleAnswers) => m["1.1"] === "no";

export const symCount = (m: ModuleAnswers) => PANIC_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes").length;
export const panicCurrent = (m: ModuleAnswers) => yes(m, "1.1");
export const panicPast = (m: ModuleAnswers) => notCurrent(m) && yes(m, "1.2");
export const hasPanic = (m: ModuleAnswers) => panicCurrent(m) || panicPast(m);
const peakYes = (m: ModuleAnswers) => m["3"] === "yes";
const enoughSym = (m: ModuleAnswers) => symCount(m) >= 4;
const unexpected = (m: ModuleAnswers) => m["2.2"] === "yes" || !!m["2.2_unexpected"];
export const pdShown = (m: ModuleAnswers) => hasPanic(m) && peakYes(m) && enoughSym(m) && unexpected(m);
export const PD_KEYS = ["7", "8.1", "8.2", "8.3", "8.4", "9"];
const pdAnswered = (m: ModuleAnswers) => PD_KEYS.every((k) => m[k] !== undefined);
const pdAllNo = (m: ModuleAnswers) => pdAnswered(m) && PD_KEYS.every((k) => m[k] === "no");
export const afterPdShown = (m: ModuleAnswers) => pdShown(m) && pdAnswered(m) && !pdAllNo(m);
/// Panic attacks are established (peak + >=4 symptoms). The DIPS would allow
/// skipping the rest once items 7–9 are all "Nein"; the form deliberately does
/// not apply that skip, so the substance/organic rule-out is asked for every
/// patient with attacks, not only once the panic-DISORDER criteria are met.
export const panicTail = (m: ModuleAnswers) => hasPanic(m) && peakYes(m) && enoughSym(m);

export const agoraCurrent = (m: ModuleAnswers) => yes(m, "1.1") && (yes(m, "1.2") || yes(m, "1.3"));
export const agoraPast = (m: ModuleAnswers) => notCurrent(m) && yes(m, "1.4") && (yes(m, "1.5") || yes(m, "1.6"));
const agoraEnter = (m: ModuleAnswers) => agoraCurrent(m) || agoraPast(m);
export const socCurrent = agoraCurrent; // same screening layout: 1.1 + (1.2 | 1.3)
export const socPast = agoraPast; //                                 1.4 + (1.5 | 1.6)
const socEnter = (m: ModuleAnswers) => socCurrent(m) || socPast(m);
export const phobiaCurrent = (m: ModuleAnswers) => yes(m, "1.1");
export const phobiaPast = (m: ModuleAnswers) => notCurrent(m) && yes(m, "1.2");
const phobiaEnter = (m: ModuleAnswers) => phobiaCurrent(m) || phobiaPast(m);

/// Accompanying symptoms endorsed ("Symptom erfüllt").
export const gadSymCount = (m: ModuleAnswers) => GAD_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes").length;
/// "At least some symptoms on the majority of days": one endorsed symptom
/// rated present on most days. Records without any majority rating (older
/// interviews) are not failed on it.
export const gadSomeMajority = (m: ModuleAnswers) => {
  const endorsed = GAD_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes");
  const rated = endorsed.filter((s) => m[`symptoms_${s.key}_maj`] !== undefined);
  return rated.length === 0 ? endorsed.length > 0 : rated.some((s) => m[`symptoms_${s.key}_maj`] === "yes");
};
export const gadCurrent = (m: ModuleAnswers) => yes(m, "1.1");
export const gadPast = (m: ModuleAnswers) => notCurrent(m) && yes(m, "1.4");
const gadEnter = (m: ModuleAnswers) => gadCurrent(m) || gadPast(m);
/// Tail entry at >=1 symptom (not the adult threshold of 3 at which the DIPS
/// lets the interviewer skip ahead): diagnosis.ts applies the DSM-5 child rule
/// of one symptom for minors, and the form has no age context.
export const gadFull = (m: ModuleAnswers) => gadEnter(m) && gadSymCount(m) >= 1;
export const sepSymCount = (m: ModuleAnswers) => SEP_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes").length;
export const sepCurrent = (m: ModuleAnswers) => yes(m, "1.1");
export const sepPast = (m: ModuleAnswers) => notCurrent(m) && yes(m, "1.3");
const sepEnter = (m: ModuleAnswers) => sepCurrent(m) || sepPast(m);
export const sepFull = (m: ModuleAnswers) => sepEnter(m) && sepSymCount(m) >= 3;

/* ---- modules ---- */
const MOD_PANIC: DipsModule = {
  id: "panic", code: "PAS", color: PALETTE[0],
  title: L("Panikanfälle / Panikstörung", "Attaques de panique / Trouble panique", "Panic attacks / Panic disorder"),
  enter: hasPanic,
  sections: [
    { id: "screen", title: L("Panikanfälle", "Attaques de panique", "Panic attacks"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Kommt es zurzeit vor, dass Sie plötzlich innerhalb kurzer Zeit starke Angst bekommen oder Ihnen ganz unwohl wird?", "Vous arrive-t-il actuellement d'éprouver soudainement, en peu de temps, une peur intense ou un grand malaise ?", "Do you currently experience times when, suddenly and within a short period, you feel intense fear or become very uncomfortable?") },
      { id: "1.2", code: "1.2", req: true, type: "yesno", showIf: notCurrent, q: L("Gab es jemals solche Zeiten?", "Y a-t-il déjà eu de telles périodes ?", "Has there ever been such a time?") },
      { id: "1.3", code: "1.3", type: "monthyear_range", showIf: panicPast, q: L("Wann war die letzte solche Phase?", "Quand a eu lieu la dernière période de ce type ?", "When was the most recent such phase?") },
      { id: "2.1", code: "2.1", type: "textarea", showIf: hasPanic, q: L("In welchen Situationen haben Sie das erlebt?", "Dans quelles situations ?", "In which situations did you experience this?") },
      { id: "2.2", code: "2.2", req: true, type: "yesno", showIf: hasPanic, q: L("Treten diese Panikanfälle meistens unerwartet auf?", "Surviennent-elles surtout de manière inattendue ?", "Do these attacks mostly occur unexpectedly?"),
        checks: [{ key: "unexpected", label: L("unerwartete Attacken", "attaques inattendues", "unexpected attacks") }, { key: "expected", label: L("erwartete Attacken (situationsgebunden)", "attaques attendues (situationnelles)", "expected attacks (situational)") }] },
      { id: "3", code: "3", req: true, type: "yesno", showIf: hasPanic, q: L("Erreicht der Anfall meistens innerhalb weniger Minuten seinen Höhepunkt?", "Atteint-elle son maximum en quelques minutes ?", "Does the attack usually peak within a few minutes?") },
      { id: "4", code: "4", type: "date", showIf: (m) => hasPanic(m) && peakYes(m), q: L("Wann war Ihr letzter typischer Panikanfall?", "Quand a eu lieu votre dernière attaque typique ?", "When was your last typical panic attack?") },
      { id: "symptoms", code: "5", req: true, type: "grid", showIf: (m) => hasPanic(m) && peakYes(m), primaryLabel: T.present,
        note: L(
          "Geben Sie für jedes Symptom an, ob es vorhanden war; falls ja, kann Schweregrad/Beunruhigung (0–3) eingeschätzt werden. Lagen beim letzten typischen Anfall weniger als vier Symptome vor: klären, ob jemals ein Anfall mit mindestens vier Symptomen auftrat, und diesen kodieren.",
          "Pour chaque symptôme, indiquez s'il était présent ; si oui, la sévérité/l'inquiétude (0–3) peut être évaluée. Si la dernière attaque typique comptait moins de quatre symptômes : vérifier s'il y a déjà eu une attaque avec au moins quatre symptômes et coder celle-ci.",
          "For each symptom, indicate whether it was present; if so, severity/concern (0–3) can be rated. If the last typical attack had fewer than four symptoms: clarify whether there was ever an attack with at least four, and code that one.",
        ),
        q: L("Während des letzten typischen Panikanfalls — erlebten Sie da …", "Lors de la dernière attaque typique — avez-vous ressenti …", "During your last typical panic attack, did you experience …"),
        groups: [{ rows: PANIC_SYMPTOMS }], cols: [{ key: "sev", kind: "sev03", label: L("Schweregrad / Beunruhigung (0–3)", "Sévérité / inquiétude (0–3)", "Severity / concern (0–3)") }] },
      { id: "6", code: "6", type: "number_label", showIf: (m) => hasPanic(m) && peakYes(m) && enoughSym(m), q: L("Wie oft erleben Sie Panikanfälle?", "À quelle fréquence ?", "How often do you experience panic attacks?"), unit: T.perMonth },
    ] },
    { id: "pd", title: L("Panikstörung", "Trouble panique", "Panic disorder"), intro: L("Nur falls unerwartete Anfälle vorliegen. Bitte klären, ob es sich um den aktuellen oder einen vergangenen Zeitraum handelt.", "Uniquement en cas d'attaques inattendues. Préciser s'il s'agit de la période actuelle ou d'une période passée.", "Only if unexpected attacks are present. Clarify whether this concerns the current or a past period."), items: [
      { id: "7", code: "7", req: true, type: "yesno", showIf: pdShown, q: L("Gab es jemals einen Zeitraum von mindestens einem Monat, in dem Sie sich Sorgen machten, weitere Anfälle zu bekommen?", "Y a-t-il eu une période d'au moins un mois d'inquiétude d'en avoir d'autres ?", "Was there ever a period of at least one month of worrying about further attacks?") },
      { id: "8stem", type: "subhead", showIf: pdShown, q: L("Haben Sie über mindestens einen Monat befürchtet, dass der Anfall bedeutet, …", "Avez-vous craint pendant au moins un mois que l'attaque signifie …", "Have you feared for at least one month that the attack means …") },
      { id: "8.1", code: "8.1", req: true, type: "yesno", showIf: pdShown, q: L("… dass Sie verrückt werden?", "… que vous devenez fou/folle ?", "… that you are going crazy?") },
      { id: "8.2", code: "8.2", req: true, type: "yesno", showIf: pdShown, q: L("… dass Sie einen Herzinfarkt erleiden?", "… une crise cardiaque ?", "… that you will have a heart attack?") },
      { id: "8.3", code: "8.3", req: true, type: "yesno", showIf: pdShown, q: L("… dass Sie die Kontrolle verlieren?", "… perdre le contrôle ?", "… that you will lose control?") },
      { id: "8.4", code: "8.4", req: true, type: "yesno", showIf: pdShown, q: L("… dass er andere schlimme Folgen haben könnte?", "… d'autres conséquences graves ?", "… that it could have other serious consequences?") },
      { id: "9", code: "9", req: true, type: "yesno_text", showIf: pdShown, q: L("Haben Sie über einen Monat Ihr Verhalten verändert, um Anfälle zu vermeiden (z. B. den Körper genau beobachtet, Aufregendes oder Unbekanntes gemieden)?", "Avez-vous modifié votre comportement pendant un mois pour éviter les attaques (p. ex. surveiller votre corps, éviter l'excitation ou l'inconnu) ?", "Did you change your behaviour for over a month to avoid attacks (e.g. monitoring your body closely, avoiding exciting or unfamiliar situations)?") },
      { id: "10", code: "10", req: true, type: "yesno_text", showIf: afterPdShown, q: L("Haben Sie bestimmte Situationen vermieden?", "Avez-vous évité certaines situations ?", "Have you avoided certain situations?") },
    ] },
    mkTail({ enter: panicTail,
      codes: { subst1: "11.1", subst2: "11.2", organic: "12", onset_age: "13", cog: "14", cope: "15", hist1: "16.1", hist2: "16.2", impact: "17", earlier: "18" },
      starred: ["subst1", "subst2", "organic"],
      cognition: L("Was scheint die Panikanfälle auszulösen (innere Empfindungen, Situationen)?", "Qu'est-ce qui semble déclencher les attaques ?", "What seems to trigger the panic attacks (inner sensations, situations)?"),
      coping: L("Was tun Sie, wenn ein Panikanfall auftritt?", "Que faites-vous lors d'une attaque ?", "What do you do when a panic attack occurs?"),
      organic: ORGANIC_DEFAULT }),
  ],
};

const MOD_AGORA: DipsModule = {
  id: "agora", code: "AG", color: PALETTE[2],
  title: L("Agoraphobie", "Agoraphobie", "Agoraphobia"), enter: agoraEnter,
  sections: [
    { id: "screen", title: L("Agoraphobie", "Agoraphobie", "Agoraphobia"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Gibt es Situationen, in denen Sie Angst haben (z. B. Autofahren, Schlange stehen, Kaufhäuser, Menschenmengen, enge geschlossene Räume)?", "Y a-t-il des situations où vous avez peur (p. ex. conduire, files d'attente, grands magasins, foules, espaces clos étroits) ?", "Are there situations in which you feel afraid (e.g. driving, queues, department stores, crowds, narrow enclosed spaces)?") },
      { id: "1.2", code: "1.2", req: true, type: "yesno_text", describe: FEARED_SYMPTOMS, showIf: (m) => yes(m, "1.1"), q: L("Vermeiden/fürchten Sie diese, weil ein Verlassen im Fall panikähnlicher oder peinlicher Symptome schwierig wäre?", "Les évitez-vous parce qu'il serait difficile de partir en cas de symptômes de panique ou gênants ?", "Do you avoid/fear these because leaving would be difficult if panic-like or embarrassing symptoms occurred?") },
      { id: "1.3", code: "1.3", req: true, type: "yesno_text", describe: FEARED_SYMPTOMS, showIf: (m) => yes(m, "1.1"), q: L("… oder weil Sie im Fall solcher Symptome nicht rechtzeitig Hilfe bekommen könnten?", "… ou parce que vous ne pourriez pas obtenir d'aide à temps ?", "… or because you could not get help in time if such symptoms occurred?") },
      { id: "1.4", code: "1.4", req: true, type: "yesno_text", showIf: notCurrent, q: L("Gab es jemals eine Zeit mit Angst vor solchen Situationen?", "Y a-t-il déjà eu une période de peur de telles situations ?", "Was there ever a time of fearing such situations?") },
      { id: "1.5", code: "1.5", req: true, type: "yesno_text", describe: FEARED_SYMPTOMS, showIf: (m) => notCurrent(m) && yes(m, "1.4"), q: L("Vermieden/fürchteten Sie diese wegen eines schwierigen Verlassens?", "Les évitiez-vous à cause d'un départ difficile ?", "Did you avoid/fear these because leaving would be difficult?") },
      { id: "1.6", code: "1.6", req: true, type: "yesno_text", describe: FEARED_SYMPTOMS, showIf: (m) => notCurrent(m) && yes(m, "1.4"), q: L("… oder weil Sie keine rechtzeitige Hilfe bekommen könnten?", "… ou par crainte de ne pas obtenir d'aide à temps ?", "… or because you could not get help in time?") },
      { id: "1.7", code: "1.7", type: "date", showIf: agoraPast, q: L("Wann ist eine solche Angst zum letzten Mal aufgetreten?", "Quand une telle peur est-elle survenue pour la dernière fois ?", "When did such fear last occur?") },
      { id: "companion", code: "2.1", req: true, type: "yesno_text", describe: L("Welche Person(en)?", "Quelle(s) personne(s) ?", "Which person(s)?"), showIf: agoraEnter, q: L("Macht es einen Unterschied, ob Sie in Begleitung sind? Fühlen Sie sich mit bestimmten Personen sicherer?", "Cela change-t-il si vous êtes accompagné(e) ? Vous sentez-vous plus en sécurité avec certaines personnes ?", "Does it make a difference whether you are accompanied? Do you feel safer with certain people?") },
      { id: "grid", code: "3", req: true, type: "grid", showIf: agoraEnter, primaryLabel: T.fear,
        note: L(
          "Geben Sie für jede Situation an, ob Angst besteht; falls ja, erscheinen Vermeidung und Stärke (0–3). Nur Angst wegen erwarteter Panik- oder panikartiger Symptome werten; macht Begleitung einen Unterschied, die schwierigere Situation einschätzen.",
          "Pour chaque situation, indiquez s'il y a de la peur ; si oui, l'évitement et l'intensité (0–3) apparaissent. Ne coter que la peur liée à l'anticipation de symptômes de panique ; si l'accompagnement change quelque chose, coter la situation la plus difficile.",
          "For each situation, indicate whether there is fear; if so, avoidance and intensity (0–3) appear. Only rate fear due to anticipated panic or panic-like symptoms; if company makes a difference, rate the harder situation.",
        ),
        q: L("Haben Sie Angst vor folgenden Situationen oder vermeiden Sie sie?", "Avez-vous peur des situations suivantes ou les évitez-vous ?", "Do you fear or avoid the following situations?"), groups: AGORA_SITUATIONS, cols: COLS_FEAR_AVOID },
      { id: "4", code: "4", req: true, type: "yesno", showIf: agoraEnter, q: L("Haben Sie fast jedes Mal Angst, wenn Sie in diesen Situationen sind?", "Avez-vous peur presque à chaque fois ?", "Do you feel afraid almost every time you are in these situations?") },
      { id: "safety", code: "5", type: "yesno_text", showIf: agoraEnter, q: L("Tragen Sie bestimmte Dinge bei sich oder tun Sie etwas, um sich in diesen Situationen wohler zu fühlen (z. B. Medikamente, Handy, Getränke)?", "Emportez-vous certaines choses ou faites-vous quelque chose pour vous sentir mieux (p. ex. médicaments, téléphone, boissons) ?", "Do you carry certain things or do something to feel more comfortable in these situations (e.g. medication, phone, drinks)?") },
    ] },
    mkTail({ enter: agoraEnter,
      codes: { cog: "6", cope: "7", first: "8.1", subst1: "9.1", subst2: "9.2", organic: "10", onset_age: "11.1", dur6: "11.2", hist1: "12.1", hist2: "12.2", approp: "13", impact: "14", earlier: "15" },
      starred: ["organic", "dur6", "approp", "impact"],
      cognition: L("Was denken Sie, könnte geschehen, wenn Sie in einer gemiedenen Situation festsitzen?", "Que pourrait-il se passer si vous étiez bloqué(e) dans une situation évitée ?", "What do you think could happen if you were stuck in an avoided situation?"),
      coping: L("Was tun Sie gewöhnlich, wenn Sie einen Anfall haben oder sehr ängstlich sind?", "Que faites-vous habituellement en cas d'attaque ou de forte peur ?", "What do you usually do when you have an attack or are very anxious?"),
      first: L("Erinnern Sie sich an das erste Mal, als Sie eine solche Situation nicht aufsuchen konnten oder verlassen mussten?", "Vous souvenez-vous de la première fois où vous n'avez pas pu affronter une telle situation ou avez dû la quitter ?", "Do you remember the first time you could not enter such a situation or had to leave it?"),
      organic: ORGANIC_AGORA }),
  ],
};

const MOD_SOCIAL: DipsModule = {
  id: "social", code: "SAS", color: PALETTE[3],
  title: L("Soziale Angststörung (Soziale Phobie)", "Trouble d'anxiété sociale (phobie sociale)", "Social anxiety disorder (social phobia)"), enter: socEnter,
  sections: [
    { id: "screen", title: L("Soziale Angststörung", "Anxiété sociale", "Social anxiety"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Fühlen Sie sich sehr ängstlich oder besorgt in sozialen Situationen, in denen Sie beobachtet oder beurteilt werden könnten (z. B. Gespräch führen, Unbekannte treffen, vor anderen essen, eine Rede halten)?", "Vous sentez-vous très anxieux(se) dans des situations sociales où vous pourriez être observé(e) ou jugé(e) (p. ex. converser, rencontrer des inconnus, manger devant d'autres, parler en public) ?", "Do you feel very anxious or worried in social situations where you might be observed or judged (e.g. having a conversation, meeting strangers, eating in front of others, giving a talk)?") },
      { id: "1.2", code: "1.2", req: true, type: "yesno_text", showIf: (m) => yes(m, "1.1"), q: L("Sorgen Sie sich stark, sich peinlich zu verhalten, sodass andere schlecht von Ihnen denken?", "Craignez-vous fortement de vous comporter de façon embarrassante et d'être mal jugé(e) ?", "Do you worry strongly that you might behave embarrassingly so that others think badly of you?") },
      { id: "1.3", code: "1.3", req: true, type: "yesno_text", showIf: (m) => yes(m, "1.1"), q: L("Sorgen Sie sich, dass andere Ihre Aufregung bemerken (z. B. Erröten, Zittern)?", "Craignez-vous que les autres remarquent votre nervosité (p. ex. rougir, trembler) ?", "Do you worry that others notice your nervousness (e.g. blushing, trembling)?") },
      { id: "1.4", code: "1.4", req: true, type: "yesno_text", showIf: notCurrent, q: L("Haben Sie sich jemals in solchen sozialen Situationen sehr ängstlich gefühlt?", "Vous êtes-vous déjà senti(e) très anxieux(se) dans de telles situations ?", "Have you ever felt very anxious in such social situations?") },
      { id: "1.5", code: "1.5", req: true, type: "yesno_text", showIf: (m) => notCurrent(m) && yes(m, "1.4"), q: L("Sorgten Sie sich stark, schlecht beurteilt zu werden?", "Craigniez-vous fortement d'être mal jugé(e) ?", "Did you worry strongly about being judged badly?") },
      { id: "1.6", code: "1.6", req: true, type: "yesno_text", showIf: (m) => notCurrent(m) && yes(m, "1.4"), q: L("… dass andere Ihre Aufregung bemerken?", "… que les autres remarquent votre nervosité ?", "… that others notice your nervousness?") },
      { id: "1.7", code: "1.7", type: "monthyear_range", showIf: socPast, q: L("Wann war die letzte Phase, in der diese Angst aufgetreten ist?", "Quand a eu lieu la dernière période où cette peur est survenue ?", "When was the most recent phase in which this fear occurred?") },
      { id: "2.1", code: "2.1", req: true, type: "yesno_text", showIf: socEnter, q: L("Vermeiden Sie diese sozialen Situationen?", "Évitez-vous ces situations sociales ?", "Do you avoid these social situations?") },
      { id: "2.2", code: "2.2", req: true, type: "yesno_text", showIf: (m) => socEnter(m) && m["2.1"] === "no", q: L("Ertragen Sie diese nur unter großer Angst?", "Ne les supportez-vous qu'au prix d'une grande peur ?", "Do you endure them only with great fear?") },
      { id: "grid", code: "3", req: true, type: "grid", showIf: socEnter, primaryLabel: T.fear, note: GRID_NOTE, q: L("Haben Sie Angst vor folgenden sozialen Situationen oder vermeiden Sie sie?", "Avez-vous peur des situations sociales suivantes ou les évitez-vous ?", "Do you fear or avoid the following social situations?"), groups: SOCIAL_SITUATIONS, cols: COLS_FEAR_AVOID },
      { id: "4.1", code: "4.1", type: "date", showIf: socEnter, q: SINCE_Q },
      { id: "4.2", code: "4.2", req: true, type: "yesno", showIf: socEnter, q: DUR6_Q },
      { id: "cog", code: "5", type: "textarea", showIf: socEnter, q: L("Was befürchten Sie kurz vorher, währenddessen und danach in diesen Situationen?", "Que craignez-vous avant, pendant et après ces situations ?", "What do you fear shortly before, during, and after these situations?") },
      { id: "6", code: "6", req: true, type: "yesno", showIf: socEnter, q: L("Tritt die Angst sofort auf, sobald Sie sich in die Situation begeben (oder wissen, dass Sie es werden)?", "La peur apparaît-elle immédiatement dès que vous êtes (ou allez être) dans la situation ?", "Does the anxiety arise immediately when you enter the situation (or know you will)?") },
      { id: "7", code: "7", req: true, type: "yesno", showIf: socEnter, q: L("Vermeiden Sie diese Situationen aus Angst vor einem unerwarteten Angstanfall?", "Évitez-vous ces situations par peur d'une crise d'angoisse inattendue ?", "Do you avoid these situations for fear of having an unexpected anxiety attack?") },
    ] },
    mkTail({ enter: socEnter,
      codes: { subst1: "9.1", subst2: "9.2", organic: "10", hist1: "12.1", hist2: "12.2", approp: "13", impact: "14", earlier: "15" },
      starred: ["subst1", "subst2", "organic", "approp", "impact"],
      organic: ORGANIC_DEFAULT,
      extra: [
        { id: "11", code: "11", req: true, type: "yesno", q: L("Ausschluss kultureller Ursachen: Haben Sie Angst, sich in diesen Situationen so zu verhalten, dass Sie andere in Verlegenheit bringen könnten?", "Exclusion de causes culturelles : craignez-vous de vous comporter dans ces situations de façon à mettre les autres dans l'embarras ?", "Exclusion of cultural causes: are you afraid of behaving in these situations in a way that could embarrass others?") },
      ] }),
  ],
};

const MOD_PHOBIA: DipsModule = {
  id: "phobia", code: "SPP", color: PALETTE[4],
  title: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"), enter: phobiaEnter,
  sections: [
    { id: "screen", title: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Gibt es Situationen oder Objekte (z. B. Tiere, Höhen, Stürme, Wasser, Blut, Autofahren, medizinische Behandlungen, sich anstecken), vor denen Sie sich intensiv fürchten?", "Y a-t-il des situations ou objets (p. ex. animaux, hauteurs, orages, eau, sang, conduite, soins médicaux, contamination) que vous craignez intensément ?", "Are there situations or objects (e.g. animals, heights, storms, water, blood, driving, medical procedures, infection) that you fear intensely?") },
      { id: "1.2", code: "1.2", req: true, type: "yesno_text", showIf: notCurrent, q: L("Gab es jemals solche Situationen oder Objekte?", "Y a-t-il déjà eu de telles situations ou objets ?", "Have there ever been such situations or objects?") },
      { id: "grid", code: "2", req: true, type: "grid", showIf: phobiaEnter, primaryLabel: T.fear, note: GRID_NOTE, q: L("Haben Sie starke Angst vor folgenden Dingen oder vermeiden Sie sie?", "Avez-vous très peur des éléments suivants ou les évitez-vous ?", "Do you have strong fear of, or avoid, the following?"), groups: PHOBIA_TYPES, cols: COLS_FEAR_AVOID },
      { id: "cog", code: "3", type: "textarea", showIf: phobiaEnter, q: L("Was befürchten Sie kurz vorher, währenddessen und danach?", "Que craignez-vous juste avant, pendant et après ?", "What do you fear shortly before, during, and afterwards?") },
      // Stored under id "3" since before the numbering was aligned (item 4.1).
      { id: "3", code: "4.1", req: true, type: "yesno", showIf: phobiaEnter, q: L("Tritt die Angst sofort auf, wenn Sie mit dem Objekt/der Situation konfrontiert sind (oder wissen, dass Sie es sein werden)?", "La peur apparaît-elle immédiatement face à l'objet/la situation (ou dès que vous savez que vous y serez confronté(e)) ?", "Does the fear arise immediately on confrontation with the object/situation (or once you know it is coming)?") },
      { id: "4.2", code: "4.2", req: true, type: "yesno", showIf: phobiaEnter, q: L("Nimmt die Angst zu, sobald Sie wissen, dass die Konfrontation bevorsteht, oder wenn Sie dem Objekt näher kommen?", "La peur augmente-t-elle dès que vous savez que la confrontation approche ou quand vous vous rapprochez de l'objet ?", "Does the fear increase once you know the confrontation is coming, or as you get closer to the object?") },
      { id: "4.3", code: "4.3", req: true, type: "yesno", showIf: phobiaEnter, q: L("Vermeiden Sie diese Situationen/Objekte, weil Sie einen Angstanfall befürchten?", "Évitez-vous ces situations/objets par crainte d'une crise d'angoisse ?", "Do you avoid these situations/objects because you fear having an anxiety attack?") },
      { id: "4.4", code: "4.4", req: true, type: "yesno", showIf: (m) => phobiaEnter(m) && yes(m, "4.3"), q: L("Hatten Sie auch schon unerwartete Angst-/Panikanfälle außerhalb dieser spezifischen Situation?", "Avez-vous déjà eu des crises d'angoisse/de panique inattendues en dehors de cette situation spécifique ?", "Have you also had unexpected anxiety/panic attacks outside this specific situation?") },
      { id: "4.5", code: "4.5", type: "text", showIf: (m) => phobiaEnter(m) && yes(m, "4.3") && yes(m, "4.4"), q: L("In welcher Situation war das?", "Dans quelle situation ?", "In which situation was that?") },
    ] },
    mkTail({ enter: phobiaEnter,
      codes: { since: "5.1", dur6: "5.2", subst1: "6.1", subst2: "6.2", organic: "7", hist1: "8.1", hist2: "8.2", approp: "9", impact: "10", earlier: "11" },
      starred: ["dur6", "approp", "impact"],
      organic: ORGANIC_DEFAULT }),
  ],
};

const MOD_GAD: DipsModule = {
  id: "gad", code: "GAS", color: PALETTE[6],
  title: L("Generalisierte Angststörung", "Trouble d'anxiété généralisée", "Generalised anxiety disorder"), enter: gadEnter,
  sections: [
    { id: "screen", title: L("Generalisierte Angststörung", "Anxiété généralisée", "Generalised anxiety"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno", q: L("Waren Sie in den letzten 6 Monaten an der Mehrzahl der Tage sehr besorgt und ängstlich bezüglich verschiedener Dinge oder Alltagsangelegenheiten?", "Au cours des 6 derniers mois, avez-vous été très inquiet(e) la plupart des jours à propos de diverses choses ?", "Over the past 6 months, on most days, have you been very worried and anxious about various things or everyday matters?") },
      { id: "1.2", code: "1.2", type: "textarea", showIf: gadCurrent, q: L("Welche Sorgen/Ängste waren das?", "Quelles inquiétudes ?", "What worries/fears were these?") },
      { id: "1.3", code: "1.3", req: true, type: "yesno_text", showIf: gadCurrent, q: L("Ist es schwierig, die Sorgen zu kontrollieren oder zu beenden, bzw. drängen sie sich auf, wenn Sie sich abzulenken versuchen?", "Est-il difficile de contrôler ou d'arrêter ces inquiétudes, ou s'imposent-elles malgré vous ?", "Is it difficult to control or stop the worries, or do they intrude when you try to distract yourself?") },
      { id: "1.4", code: "1.4", req: true, type: "yesno", showIf: notCurrent, q: L("Gab es jemals eine längere Phase, in der Sie ständig besorgt und ängstlich bezüglich verschiedener Dinge waren?", "Y a-t-il déjà eu une période prolongée où vous étiez constamment inquiet(e) à propos de diverses choses ?", "Was there ever a longer phase in which you were constantly worried and anxious about various things?") },
      { id: "1.5", code: "1.5", type: "textarea", showIf: gadPast, q: L("Welche Sorgen/Ängste waren das?", "Quelles inquiétudes ?", "What worries/fears were these?") },
      { id: "1.6", code: "1.6", req: true, type: "yesno_text", showIf: gadPast, q: L("War es dabei schwierig, die Sorgen zu kontrollieren oder zu beenden?", "Était-il alors difficile de contrôler ou d'arrêter ces inquiétudes ?", "Was it difficult then to control or stop the worries?") },
      { id: "1.7", code: "1.7", type: "monthyear_range", showIf: gadPast, q: L("Wann war die letzte Phase, in der diese Sorgen/Ängste auftraten?", "Quand a eu lieu la dernière période de ces inquiétudes ?", "When was the most recent phase of these worries/fears?") },
      { id: "worries", code: "3", req: true, type: "grid", showIf: gadEnter, primaryLabel: T.worry, note: L("Geben Sie an, ob Sie sich in diesen Bereichen sorgen; falls ja, erscheinen Ausprägung und Unkontrollierbarkeit.", "Indiquez si vous vous inquiétez dans ces domaines ; si oui, l'intensité et l'incontrôlabilité apparaissent.", "Indicate whether you worry in these domains; if so, intensity and uncontrollability appear."),
        q: L("Sorgen Sie sich über folgende Bereiche?", "Vous inquiétez-vous des domaines suivants ?", "Do you worry about the following domains?"), groups: GAD_WORRIES, cols: [{ key: "expr", kind: "sev03", label: T.expr }, { key: "unc", kind: "sev03", label: T.uncontrol }] },
      { id: "4.1", code: "4.1", type: "text", showIf: gadEnter, q: L("Falls unklar: Wie lange leiden Sie schon unter diesen Sorgen/Ängsten?", "Si ce n'est pas clair : depuis combien de temps souffrez-vous de ces inquiétudes ?", "If unclear: how long have you been suffering from these worries/fears?") },
      { id: "4.2", code: "4.2", req: true, type: "yesno", showIf: gadPast, q: L("Litten Sie jemals mindestens sechs Monate lang an der Mehrzahl der Tage unter diesen Sorgen/Ängsten?", "Avez-vous déjà souffert de ces inquiétudes la plupart des jours pendant au moins six mois ?", "Did you ever suffer from these worries/fears on most days for at least six months?") },
      { id: "4.3", code: "4.3", type: "monthyear_range", showIf: (m) => gadPast(m) && yes(m, "4.2"), q: L("Wann war das?", "Quand était-ce ?", "When was that?") },
      { id: "5", code: "5", req: true, type: "number_label", max: 100, showIf: gadEnter, q: L("An einem durchschnittlichen Tag in dieser Zeit: Zu wie viel Prozent des Tages fühlten Sie sich angespannt, ängstlich, besorgt? (Bitte prüfen, ob die Sorgen übermäßig sind.)", "Un jour moyen de cette période : quel pourcentage de la journée vous sentiez-vous tendu(e), anxieux(se), inquiet(e) ? (Vérifier si les inquiétudes sont excessives.)", "On an average day during this time: for what percentage of the day did you feel tense, anxious, worried? (Check whether the worries are excessive.)"), unit: L("% des Tages", "% de la journée", "% of the day") },
      { id: "symptoms", code: "6", req: true, type: "grid", showIf: gadEnter, primaryLabel: L("Symptom erfüllt?", "Symptôme présent ?", "Symptom met?"),
        note: L(
          "Geben Sie für jedes Symptom an, ob es in den letzten sechs Monaten zusammen mit den Sorgen auftrat; falls ja, erscheinen Schweregrad (0–3) und „Mehrzahl der Tage“. Symptome im Zusammenhang mit anderen Störungen (z. B. Panikanfälle) nicht werten.",
          "Pour chaque symptôme, indiquez s'il est survenu avec les inquiétudes au cours des six derniers mois ; si oui, la sévérité (0–3) et « la plupart des jours » apparaissent. Ne pas coter les symptômes liés à d'autres troubles (p. ex. attaques de panique).",
          "For each symptom, indicate whether it occurred together with the worries over the past six months; if so, severity (0–3) and \"most days\" appear. Do not count symptoms that belong to other disorders (e.g. panic attacks).",
        ),
        q: L("Erlebten Sie in den letzten 6 Monaten folgende Symptome zusammen mit den Sorgen?", "Au cours des 6 derniers mois, avez-vous éprouvé ces symptômes avec les inquiétudes ?", "Over the past 6 months, did you experience these symptoms together with the worries?"), groups: [{ rows: GAD_SYMPTOMS }], cols: [{ key: "sev", kind: "sev03", label: T.severity }, { key: "maj", kind: "yesno", req: true, label: T.majorityDays }] },
    ] },
    mkTail({ enter: gadFull,
      codes: { cog: "7", cope: "8.1", subst1: "9.1", subst2: "9.2", organic: "10", since: "11", hist1: "11.1", hist2: "11.2", impact: "12", earlier: "13" },
      starred: ["subst1", "subst2", "organic", "impact"],
      cognition: L("Was löst typischerweise Ihre Sorgen aus (z. B. bestimmte Situationen oder Aktivitäten)?", "Qu'est-ce qui déclenche typiquement vos inquiétudes ?", "What typically triggers your worries (e.g. certain situations or activities)?"),
      coping: L("Tun Sie aufgrund Ihrer Sorgen etwas, um sich zu beruhigen oder die Anspannung zu reduzieren (z. B. kontrollieren, vorbeugen, Beruhigung suchen, ablenken)? Wie oft?", "Faites-vous quelque chose pour vous calmer ou réduire la tension (p. ex. vérifier, prévenir, chercher à être rassuré(e), se distraire) ? À quelle fréquence ?", "Do you do anything because of your worries to calm yourself or reduce the tension (e.g. checking, preventing, seeking reassurance, distraction)? How often?"),
      organic: ORGANIC_DEFAULT }),
  ],
};

const MOD_SEP: DipsModule = {
  id: "sep", code: "STA", color: PALETTE[5],
  title: L("Störung mit Trennungsangst", "Trouble d'anxiété de séparation", "Separation anxiety disorder"), enter: sepEnter,
  sections: [
    { id: "screen", title: L("Störung mit Trennungsangst", "Anxiété de séparation", "Separation anxiety"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", describe: L("Welche Personen?", "Quelles personnes ?", "Which people?"), q: L("Haben Sie starke Angst davor, sich von Ihnen nahestehenden Personen zu trennen oder getrennt zu werden (z. B. Eltern, Partner, Kinder)?", "Avez-vous très peur d'être séparé(e) de proches (p. ex. parents, partenaire, enfants) ?", "Do you have strong fear of separating, or being separated, from people close to you (e.g. parents, partner, children)?") },
      { id: "1.3", code: "1.3", req: true, type: "yesno_text", describe: L("Welche Personen waren das?", "De quelles personnes s'agissait-il ?", "Which people were these?"), showIf: notCurrent, q: L("Gab es jemals solche Zeiten?", "Y a-t-il déjà eu de telles périodes ?", "Has there ever been such a time?") },
      { id: "1.5", code: "1.5", type: "monthyear_range", showIf: sepPast, q: L("Wann war die letzte Phase, in der diese Angst aufgetreten ist?", "Quand a eu lieu la dernière période où cette peur est survenue ?", "When was the most recent phase in which this fear occurred?") },
      { id: "symptoms", code: "2", req: true, type: "grid", showIf: sepEnter, primaryLabel: L("Symptom erfüllt?", "Symptôme présent ?", "Symptom met?"), note: SYMPTOM_NOTE, q: L("Treffen folgende Symptome auf Sie zu? Fürchten oder vermeiden Sie diese Situationen?", "Les symptômes suivants vous concernent-ils ? Craignez-vous ou évitez-vous ces situations ?", "Do the following apply to you? Do you fear or avoid these situations?"), groups: [{ rows: SEP_SYMPTOMS }],
        cols: [{ key: "sev", kind: "sev03", label: L("Angst / Ausprägung (0–3)", "Peur / intensité (0–3)", "Fear / intensity (0–3)") }, { key: "avoidfreq", kind: "sev03", label: L("Vermeidung (0 nie – 3 immer)", "Évitement (0 jamais – 3 toujours)", "Avoidance (0 never – 3 always)") }] },
      { id: "3", code: "3", type: "yesno", showIf: sepEnter, q: L("Haben Sie fast jedes Mal Angst, wenn Sie in diesen Situationen sind?", "Avez-vous peur presque à chaque fois ?", "Do you feel afraid almost every time you are in these situations?") },
      { id: "since", code: "4.1", type: "date", showIf: sepEnter, q: SINCE_Q },
      // NOT a DIPS Open Access item (stored under id "4.1" for historical
      // reasons): the adult interview only asks for six months. DSM-5 accepts
      // four weeks in children and adolescents, and the form has no age
      // context, so both are asked (the second only once the first is
      // affirmed) and diagnosis.ts picks by patient age.
      { id: "4.1", code: "KJ", req: true, type: "yesno", showIf: sepEnter, q: L("Kinder/Jugendliche (Ergänzung der Klinik, nicht Teil des DIPS Open Access): Dauern diese Angst und das Vermeidungsverhalten mindestens 4 Wochen an?", "Enfants/adolescents (complément de la clinique, hors DIPS Open Access) : cette peur et l'évitement durent-ils au moins 4 semaines ?", "Children/adolescents (clinic addition, not part of DIPS Open Access): have this fear and avoidance lasted at least 4 weeks?") },
      { id: "4.2", code: "4.2", req: true, type: "yesno", showIf: (m) => sepEnter(m) && m["4.1"] === "yes", q: DUR6_Q },
    ] },
    mkTail({ enter: sepFull,
      codes: { first: "5.1", hist1: "6.1", hist2: "6.2", approp: "7", subst1: "8.1", subst2: "8.2", organic: "9", impact: "10", earlier: "11" },
      starred: ["approp", "impact"],
      first: L("Erinnern Sie sich an das erste Mal, als Sie Angst vor den beschriebenen Situationen hatten oder diese vermieden haben? Wie alt waren Sie?", "Vous souvenez-vous de la première fois où vous avez eu peur des situations décrites ou les avez évitées ? Quel âge aviez-vous ?", "Do you remember the first time you feared or avoided the situations described? How old were you?"),
      organic: ORGANIC_DEFAULT }),
  ],
};

export const MODULES: DipsModule[] = [MOD_PANIC, MOD_AGORA, MOD_SOCIAL, MOD_PHOBIA, MOD_GAD, MOD_SEP];
