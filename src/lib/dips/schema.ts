import { L, T } from "../i18n";
import { PALETTE } from "../theme";
import type { ModuleAnswers } from "../types";
import type { DipsModule, GridCol, GridGroup, Item, OrganicExamples, Section, TailOptions } from "./types";

/* shared rating note for fear/avoidance grids */
const GRID_NOTE = L(
  "Geben Sie für jede Situation an, ob Angst besteht; falls ja, erscheinen Stärke (0–3) und Vermeidung.",
  "Pour chaque situation, indiquez s'il y a de la peur ; si oui, l'intensité (0–3) et l'évitement apparaissent.",
  "For each situation, indicate whether there is fear; if so, intensity (0–3) and avoidance appear.",
);

/* fear/avoidance grid follow-up columns: severity 0-3 + avoidance y/n (shown when fear=yes) */
const COLS_FEAR_AVOID: GridCol[] = [
  { key: "sev", kind: "sev03", label: L("Stärke der Angst (0–3)", "Intensité de la peur (0–3)", "Strength of fear (0–3)") },
  { key: "avoid", kind: "yesno", label: L("Vermeiden Sie das?", "Évitez-vous cela ?", "Do you avoid it?") },
];

const ORG_EX = (ex: OrganicExamples) =>
  L(
    `Lagen kurz bevor die Symptomatik begonnen hat oder seitdem sie besteht besondere körperliche Bedingungen oder Erkrankungen vor (z. B. ${ex.de}), die die Symptome verursacht haben könnten?`,
    `Peu avant le début des symptômes ou depuis qu'ils persistent, y avait-il des conditions ou maladies physiques particulières (p. ex. ${ex.fr}) susceptibles de les avoir causés ?`,
    `Shortly before the symptoms began, or since they have persisted, were there particular physical conditions or illnesses (e.g. ${ex.en}) that may have caused them?`,
  );

/* shared module "tail": exclusions, onset, optional duration/appropriateness, history, impairment, earlier phases */
function mkTail(opts: TailOptions): Section {
  const enter = opts.enter;
  const items: Item[] = [];
  items.push({ id: "tail_head", type: "subhead", showIf: enter, q: L("Weitere Angaben", "Informations complémentaires", "Further details") });
  if (opts.cognition) items.push({ id: "cog", type: "textarea", showIf: enter, q: opts.cognition });
  if (opts.coping) items.push({ id: "cope", type: "textarea", showIf: enter, q: opts.coping });
  if (opts.appropriateness)
    items.push({
      id: "approp", type: "yesno", req: true, showIf: enter,
      q: L("Würden Sie die beschriebene Angst in diesen Situationen als angemessen beurteilen?", "Jugeriez-vous cette peur appropriée dans ces situations ?", "Would you judge this fear to be appropriate in these situations?"),
    });
  items.push({ id: "subst_head", type: "subhead", showIf: enter, q: L("Ausschluss von Substanzeffekten", "Exclusion d'effets de substances", "Exclusion of substance effects") });
  items.push({
    id: "subst1", type: "yesno_text", req: true, showIf: enter,
    q: L("Nahmen Sie unmittelbar vor oder seit Beginn dieser Symptome Medikamente oder Drogen (einschließlich Koffein) oder tranken Sie ungewöhnlich viel Alkohol?", "Avez-vous pris des médicaments ou des drogues (y compris de la caféine) juste avant ou depuis le début de ces symptômes, ou bu une quantité inhabituelle d'alcool ?", "Did you take medications or drugs (including caffeine) immediately before or since these symptoms began, or drink unusually large amounts of alcohol?"),
    describe: L("Art, Dosis, Zeitpunkt", "Type, dose, moment", "Type, dose, timing"),
  });
  items.push({
    id: "subst2", type: "yesno", req: true, showIf: enter,
    q: L("Verursacht die Einnahme oder der Entzug von Medikamenten, Drogen oder Alkohol möglicherweise die Symptome?", "La prise ou le sevrage de médicaments, de drogues ou d'alcool pourrait-il être à l'origine des symptômes ?", "Could the use or withdrawal of medications, drugs, or alcohol possibly cause the symptoms?"),
  });
  items.push({ id: "organic", type: "yesno_text", req: true, showIf: enter, q: ORG_EX(opts.organic), describe: L("Welche?", "Lesquelles ?", "Which?") });
  items.push({
    id: "onset_age", type: "number_label", showIf: enter,
    q: L("Wie alt waren Sie, als Sie erstmals durch diese Angst belastet und im Alltag beeinträchtigt wurden?", "Quel âge aviez-vous lorsque cette peur vous a affecté(e) et gêné(e) au quotidien pour la première fois ?", "How old were you when this fear first distressed you and impaired your daily life?"),
    unit: L("Beginn (Lebensalter)", "Début (âge)", "Onset (age)"),
  });
  if (opts.duration6)
    items.push({
      id: "dur6", type: "yesno", req: true, showIf: enter,
      q: L("Dauern diese Angst und das Vermeidungsverhalten mindestens 6 Monate an?", "Cette peur et l'évitement durent-ils au moins 6 mois ?", "Have this fear and the avoidance lasted at least 6 months?"),
    });
  items.push({
    id: "hist1", type: "yesno_text", showIf: enter,
    q: L("Erinnern Sie sich an etwas, das dazu beigetragen haben könnte, dass Sie diese Angst zum ersten Mal erlebten?", "Vous souvenez-vous de quelque chose qui aurait pu contribuer à la première apparition de cette peur ?", "Do you recall anything that may have contributed to your first experiencing this fear?"),
  });
  items.push({
    id: "hist2", type: "yesno_text", showIf: enter,
    q: L("Standen Sie in dieser Zeit unter Belastung (z. B. Schwierigkeiten mit Familie/Freund*innen, Beruf/Schule, Gesundheit, Finanzen, juristische Angelegenheiten)?", "Étiez-vous sous tension à cette période (p. ex. difficultés avec la famille/les amis, le travail/l'école, la santé, les finances, des questions juridiques) ?", "Were you under stress at that time (e.g. difficulties with family/friends, work/school, health, finances, legal matters)?"),
  });
  items.push({
    id: "impact", type: "dual_scale", showIf: enter,
    q: L("Wie stark beeinträchtigen Sie diese Ängste/Vermeidung in Ihrem Leben, und wie stark belasten sie Sie?", "Dans quelle mesure ces peurs/évitements nuisent-ils à votre vie, et à quel point vous affectent-ils ?", "How strongly do these fears/avoidance impair your life, and how distressed are you by them?"),
    help: L("0 = gar nicht · 8 = sehr schwer (≥ 4 gilt als klinisch relevant)", "0 = pas du tout · 8 = très sévère (≥ 4 = cliniquement pertinent)", "0 = not at all · 8 = very severe (≥ 4 is considered clinically relevant)"),
    parts: [
      { key: "impair", label: L("Beeinträchtigung", "Altération", "Impairment") },
      { key: "distress", label: L("Belastung", "Détresse", "Distress") },
    ],
  });
  items.push({
    id: "earlier", type: "yesno_text", showIf: enter,
    q: L("Gab es neben dieser aktuellen Phase schon frühere Phasen, in denen es Ihnen ähnlich erging?", "En dehors de cette période actuelle, y a-t-il eu des périodes antérieures similaires ?", "Apart from this current phase, have there been earlier phases in which you felt similarly?"),
    describe: L("Daten früherer Phasen", "Dates des périodes antérieures", "Dates of earlier phases"),
  });
  return { id: "tail", title: L("Weitere Angaben", "Informations complémentaires", "Further details"), items };
}

/* ---- list data ---- */
export const PANIC_SYMPTOMS: { key: string; label: ReturnType<typeof L> }[] = [
  { key: "s1", label: L("Herzklopfen, Herzrasen oder beschleunigter Herzschlag?", "Palpitations, battements de cœur ou accélération du rythme cardiaque ?", "Palpitations, pounding heart, or accelerated heart rate?") },
  { key: "s2", label: L("Schwitzen?", "Transpiration (sueurs) ?", "Sweating?") },
  { key: "s3", label: L("Zittern oder Beben?", "Tremblements ou secousses ?", "Trembling or shaking?") },
  { key: "s4", label: L("Kurzatmigkeit oder Atemnot?", "Souffle coupé ou impression d'étouffement ?", "Shortness of breath or smothering?") },
  { key: "s5", label: L("Erstickungsgefühle?", "Sensation d'étranglement ?", "Feelings of choking?") },
  { key: "s6", label: L("Schmerzen oder Beklemmung in der Brust?", "Douleur ou gêne thoracique ?", "Chest pain or discomfort?") },
  { key: "s7", label: L("Übelkeit oder Magen-Darm-Beschwerden?", "Nausée ou gêne abdominale ?", "Nausea or abdominal distress?") },
  { key: "s8", label: L("Schwindel, Benommenheit oder Ohnmachtsnähe?", "Vertige, tête vide ou évanouissement imminent ?", "Dizziness, light-headedness, or feeling faint?") },
  { key: "s9", label: L("Gefühle der Unwirklichkeit oder des Losgelöst-Seins?", "Déréalisation ou dépersonnalisation ?", "Unreality (derealization) or detachment (depersonalization)?") },
  { key: "s10", label: L("Angst, die Kontrolle zu verlieren oder verrückt zu werden?", "Peur de perdre le contrôle ou de devenir fou/folle ?", "Fear of losing control or going crazy?") },
  { key: "s11", label: L("Angst zu sterben?", "Peur de mourir ?", "Fear of dying?") },
  { key: "s12", label: L("Taubheit oder Kribbeln?", "Engourdissements ou picotements ?", "Numbness or tingling?") },
  { key: "s13", label: L("Hitzewallungen oder Kälteschauer?", "Bouffées de chaleur ou frissons ?", "Chills or heat sensations?") },
];

const AGORA_SITUATIONS: GridGroup[] = [
  { title: L("(Öffentliche) Verkehrsmittel", "Transports (publics)", "(Public) transport"), rows: [
    { key: "car", label: L("Autofahren", "Conduire", "Driving") }, { key: "bus", label: L("Busfahren", "Prendre le bus", "Bus") },
    { key: "train", label: L("Zugfahren", "Prendre le train", "Train") }, { key: "ship", label: L("Schifffahren", "Bateau", "Boat") }, { key: "fly", label: L("Fliegen", "Avion", "Flying") }] },
  { title: L("Öffentliche Plätze", "Lieux publics ouverts", "Open public spaces"), rows: [
    { key: "park", label: L("Parkplätze", "Parkings", "Car parks") }, { key: "market", label: L("Marktplätze", "Places de marché", "Marketplaces") }, { key: "bridge", label: L("Brücken", "Ponts", "Bridges") }] },
  { title: L("Geschlossene Räume", "Lieux clos", "Enclosed places"), rows: [
    { key: "cinema", label: L("Kino, Theater", "Cinéma, théâtre", "Cinema, theatre") }, { key: "shops", label: L("Geschäfte / Supermärkte", "Magasins / supermarchés", "Shops / supermarkets") },
    { key: "lift", label: L("Fahrstühle / Lifte", "Ascenseurs", "Lifts / elevators") }, { key: "tunnel", label: L("Enge Räume, Tunnel", "Espaces étroits, tunnels", "Narrow spaces, tunnels") }, { key: "alonehome", label: L("Allein zu Hause sein", "Être seul(e) à la maison", "Being alone at home") }] },
  { title: L("Menschenmengen", "Foules / files d'attente", "Crowds / queues"), rows: [
    { key: "queue", label: L("Schlange stehen", "Faire la queue", "Standing in line") }, { key: "crowd", label: L("Menschenansammlungen", "Rassemblements", "Crowds") }] },
  { title: L("Draußen alleine sein", "Être seul(e) dehors", "Being outside alone"), rows: [
    { key: "outside", label: L("Aus dem Haus gehen", "Sortir de chez soi", "Leaving the house") }] },
];

const SOCIAL_SITUATIONS: GridGroup[] = [
  { title: L("Soziale & Leistungssituationen", "Situations sociales et de performance", "Social & performance situations"), rows: [
    { key: "party", label: L("Partys", "Fêtes", "Parties") }, { key: "meet", label: L("Treffen, Tagungen, Schule", "Réunions, écoles", "Meetings, school") },
    { key: "eat", label: L("Essen in der Öffentlichkeit", "Manger en public", "Eating in public") }, { key: "toilet", label: L("Öffentliche Toiletten benutzen", "Toilettes publiques", "Using public toilets") },
    { key: "talkfam", label: L("Mit vertrauten Personen sprechen", "Parler à des proches", "Talking to familiar people") }, { key: "speak", label: L("Vor einer Gruppe / förmlich sprechen", "Parler devant un groupe", "Speaking before a group") },
    { key: "perform", label: L("Auftritte", "Se produire en public", "Performing") }, { key: "talkstranger", label: L("Mit unvertrauten Personen sprechen", "Parler à des inconnus", "Talking to unfamiliar people") },
    { key: "write", label: L("Vor anderen schreiben", "Écrire devant les autres", "Writing in front of others") }, { key: "date", label: L("Rendezvous, Verabredungen", "Rendez-vous", "Dates") },
    { key: "authority", label: L("Mit Autoritätspersonen sprechen", "Parler à des figures d'autorité", "Talking to authority figures") }, { key: "assert", label: L("Selbstsicher auftreten (z. B. Nein sagen)", "S'affirmer (p. ex. dire non)", "Being assertive (e.g. saying no)") },
    { key: "startconv", label: L("Ein Gespräch beginnen", "Engager une conversation", "Starting a conversation") }, { key: "keepconv", label: L("Ein Gespräch aufrechterhalten", "Maintenir une conversation", "Maintaining a conversation") },
    { key: "examoral", label: L("Mündliche Prüfungen", "Examens oraux", "Oral exams") }, { key: "examwritten", label: L("Schriftliche Prüfungen", "Examens écrits", "Written exams") }] },
];

const PHOBIA_TYPES: GridGroup[] = [
  { title: L("Tiere", "Animaux", "Animals"), rows: [
    { key: "animal1", label: L("Tier 1 (z. B. Spinnen, Schlangen, Hunde)", "Animal 1 (p. ex. araignées, serpents, chiens)", "Animal 1 (e.g. spiders, snakes, dogs)") },
    { key: "animal2", label: L("Tier 2", "Animal 2", "Animal 2") }] },
  { title: L("Umwelt", "Environnement naturel", "Natural environment"), rows: [
    { key: "heights", label: L("Höhen", "Hauteurs", "Heights") }, { key: "storms", label: L("Stürme", "Orages", "Storms") }, { key: "water", label: L("Wasser", "Eau", "Water") }] },
  { title: L("Blut, Spritzen, Verletzungen", "Sang, injections, blessures", "Blood, injections, injuries"), rows: [
    { key: "blood", label: L("Blut sehen", "Voir du sang", "Seeing blood") }, { key: "injection", label: L("Eine Spritze erhalten", "Recevoir une injection", "Receiving an injection") }, { key: "draw", label: L("Blut abgenommen bekommen", "Prise de sang", "Having blood drawn") }] },
  { title: L("Situativ", "Situationnel", "Situational"), rows: [
    { key: "planes", label: L("Flugzeuge", "Avions", "Aeroplanes") }, { key: "elevators", label: L("Aufzüge", "Ascenseurs", "Lifts") }, { key: "enclosed", label: L("Enge geschlossene Räume", "Espaces clos étroits", "Narrow enclosed spaces") }] },
  { title: L("Andere", "Autres", "Other"), rows: [
    { key: "dental", label: L("Medizinische / zahnärztliche Behandlungen", "Soins médicaux / dentaires", "Medical / dental procedures") }, { key: "choke", label: L("Sich verschlucken, ersticken", "S'étouffer", "Choking") },
    { key: "vomit", label: L("Erbrechen", "Vomir", "Vomiting") }, { key: "infect", label: L("Sich anstecken", "Être contaminé(e)", "Becoming infected") }] },
];

const GAD_WORRIES: GridGroup[] = [
  { title: L("Sorgenbereiche", "Domaines d'inquiétude", "Worry domains"), rows: [
    { key: "family", label: L("Familie", "Famille", "Family") }, { key: "work", label: L("Arbeit oder Ausbildung", "Travail ou formation", "Work or education") },
    { key: "finance", label: L("Finanzen", "Finances", "Finances") }, { key: "ownhealth", label: L("Eigene Gesundheit", "Sa propre santé", "Own health") },
    { key: "otherhealth", label: L("Gesundheit nahestehender Personen", "Santé des proches", "Health of loved ones") }, { key: "social", label: L("Soziale / zwischenmenschliche Themen", "Sujets sociaux / relationnels", "Social / interpersonal matters") },
    { key: "minor", label: L("Kleinere Angelegenheiten, Alltag", "Petites affaires du quotidien", "Minor everyday matters") }, { key: "society", label: L("Gesellschaft / Weltgeschehen", "Société / actualité mondiale", "Society / world events") }] },
];
export const GAD_SYMPTOMS = [
  { key: "restless", label: L("Ruhelosigkeit, Nervosität", "Agitation, nervosité", "Restlessness, nervousness") },
  { key: "fatigue", label: L("Leichte Ermüdbarkeit", "Fatigabilité", "Being easily fatigued") },
  { key: "concentration", label: L("Konzentrationsschwierigkeiten", "Difficultés de concentration", "Difficulty concentrating") },
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

/* ---- predicates ---- */
export const symCount = (m: ModuleAnswers) => PANIC_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes").length;
export const hasPanic = (m: ModuleAnswers) => m["1.1"] === "yes" || m["1.2"] === "yes";
const peakYes = (m: ModuleAnswers) => m["3"] === "yes";
const enoughSym = (m: ModuleAnswers) => symCount(m) >= 4;
const unexpected = (m: ModuleAnswers) => m["2.2"] === "yes" || !!m["2.2_unexpected"];
export const pdShown = (m: ModuleAnswers) => hasPanic(m) && peakYes(m) && enoughSym(m) && unexpected(m);
const PD_KEYS = ["7", "8.1", "8.2", "8.3", "8.4", "9"];
const pdAnswered = (m: ModuleAnswers) => PD_KEYS.every((k) => m[k] !== undefined);
const pdAllNo = (m: ModuleAnswers) => pdAnswered(m) && PD_KEYS.every((k) => m[k] === "no");
const afterPdShown = (m: ModuleAnswers) => pdShown(m) && pdAnswered(m) && !pdAllNo(m);

const agoraEnter = (m: ModuleAnswers) => (m["1.1"] === "yes" && (m["1.2"] === "yes" || m["1.3"] === "yes")) || (m["1.4"] === "yes" && (m["1.5"] === "yes" || m["1.6"] === "yes"));
const socEnter = (m: ModuleAnswers) => (m["1.1"] === "yes" && (m["1.2"] === "yes" || m["1.3"] === "yes")) || (m["1.4"] === "yes" && (m["1.5"] === "yes" || m["1.6"] === "yes"));
const phobiaEnter = (m: ModuleAnswers) => m["1.1"] === "yes" || m["1.2"] === "yes";
export const gadSymCount = (m: ModuleAnswers) => GAD_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes").length;
const gadEnter = (m: ModuleAnswers) => m["1.1"] === "yes";
const gadFull = (m: ModuleAnswers) => gadEnter(m) && gadSymCount(m) >= 3;
export const sepSymCount = (m: ModuleAnswers) => SEP_SYMPTOMS.filter((s) => m[`symptoms_${s.key}_primary`] === "yes").length;
const sepEnter = (m: ModuleAnswers) => m["1.1"] === "yes" || m["1.3"] === "yes";
const sepFull = (m: ModuleAnswers) => sepEnter(m) && sepSymCount(m) >= 3;

/* ---- modules ---- */
const MOD_PANIC: DipsModule = {
  id: "panic", code: "PAS", color: PALETTE[0],
  title: L("Panikanfälle / Panikstörung", "Attaques de panique / Trouble panique", "Panic attacks / Panic disorder"),
  enter: hasPanic,
  sections: [
    { id: "screen", title: L("Panikanfälle", "Attaques de panique", "Panic attacks"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Kommt es zurzeit vor, dass Sie plötzlich innerhalb kurzer Zeit starke Angst bekommen oder Ihnen ganz unwohl wird?", "Vous arrive-t-il actuellement d'éprouver soudainement, en peu de temps, une peur intense ou un grand malaise ?", "Do you currently experience times when, suddenly and within a short period, you feel intense fear or become very uncomfortable?") },
      { id: "1.2", code: "1.2", req: true, type: "yesno", q: L("Gab es jemals solche Zeiten?", "Y a-t-il déjà eu de telles périodes ?", "Has there ever been such a time?") },
      { id: "1.3", code: "1.3", type: "monthyear_range", showIf: (m) => m["1.2"] === "yes", q: L("Wann war die letzte solche Phase?", "Quand a eu lieu la dernière période de ce type ?", "When was the most recent such phase?") },
      { id: "2.1", code: "2.1", type: "textarea", showIf: hasPanic, q: L("In welchen Situationen haben Sie das erlebt?", "Dans quelles situations ?", "In which situations did you experience this?") },
      { id: "2.2", code: "2.2", req: true, type: "yesno", showIf: hasPanic, q: L("Treten diese Panikanfälle meistens unerwartet auf?", "Surviennent-elles surtout de manière inattendue ?", "Do these attacks mostly occur unexpectedly?"),
        checks: [{ key: "unexpected", label: L("unerwartete Attacken", "attaques inattendues", "unexpected attacks") }, { key: "expected", label: L("erwartete Attacken (situationsgebunden)", "attaques attendues (situationnelles)", "expected attacks (situational)") }] },
      { id: "3", code: "3", req: true, type: "yesno", showIf: hasPanic, q: L("Erreicht der Anfall meistens innerhalb weniger Minuten seinen Höhepunkt?", "Atteint-elle son maximum en quelques minutes ?", "Does the attack usually peak within a few minutes?") },
      { id: "4", code: "4", type: "date", showIf: (m) => hasPanic(m) && peakYes(m), q: L("Wann war Ihr letzter typischer Panikanfall?", "Quand a eu lieu votre dernière attaque typique ?", "When was your last typical panic attack?") },
      { id: "symptoms", code: "5", type: "grid", showIf: (m) => hasPanic(m) && peakYes(m), primaryLabel: T.present, note: GRID_NOTE,
        q: L("Während des letzten typischen Panikanfalls — erlebten Sie da …", "Lors de la dernière attaque typique — avez-vous ressenti …", "During your last typical panic attack, did you experience …"),
        groups: [{ rows: PANIC_SYMPTOMS }], cols: [{ key: "sev", kind: "sev03", label: T.severity }] },
      { id: "6", code: "6", type: "number_label", showIf: (m) => hasPanic(m) && peakYes(m) && enoughSym(m), q: L("Wie oft erleben Sie Panikanfälle?", "À quelle fréquence ?", "How often do you experience panic attacks?"), unit: T.perMonth },
    ] },
    { id: "pd", title: L("Panikstörung", "Trouble panique", "Panic disorder"), intro: L("Nur falls unerwartete Anfälle vorliegen.", "Uniquement en cas d'attaques inattendues.", "Only if unexpected attacks are present."), items: [
      { id: "7", code: "7", req: true, type: "yesno", showIf: pdShown, q: L("Gab es jemals einen Zeitraum von mindestens einem Monat, in dem Sie sich Sorgen machten, weitere Anfälle zu bekommen?", "Y a-t-il eu une période d'au moins un mois d'inquiétude d'en avoir d'autres ?", "Was there ever a period of at least one month of worrying about further attacks?") },
      { id: "8stem", type: "subhead", showIf: pdShown, q: L("Haben Sie über mindestens einen Monat befürchtet, dass der Anfall bedeutet, …", "Avez-vous craint pendant au moins un mois que l'attaque signifie …", "Have you feared for at least one month that the attack means …") },
      { id: "8.1", code: "8.1", req: true, type: "yesno", showIf: pdShown, q: L("… dass Sie verrückt werden?", "… que vous devenez fou/folle ?", "… that you are going crazy?") },
      { id: "8.2", code: "8.2", req: true, type: "yesno", showIf: pdShown, q: L("… dass Sie einen Herzinfarkt erleiden?", "… une crise cardiaque ?", "… that you will have a heart attack?") },
      { id: "8.3", code: "8.3", req: true, type: "yesno", showIf: pdShown, q: L("… dass Sie die Kontrolle verlieren?", "… perdre le contrôle ?", "… that you will lose control?") },
      { id: "8.4", code: "8.4", req: true, type: "yesno", showIf: pdShown, q: L("… dass er andere schlimme Folgen haben könnte?", "… d'autres conséquences graves ?", "… that it could have other serious consequences?") },
      { id: "9", code: "9", req: true, type: "yesno_text", showIf: pdShown, q: L("Haben Sie über einen Monat Ihr Verhalten verändert, um Anfälle zu vermeiden?", "Avez-vous modifié votre comportement pendant un mois pour éviter les attaques ?", "Did you change your behaviour for over a month to avoid attacks?") },
      { id: "10", code: "10", req: true, type: "yesno_text", showIf: afterPdShown, q: L("Haben Sie bestimmte Situationen vermieden?", "Avez-vous évité certaines situations ?", "Have you avoided certain situations?") },
    ] },
    mkTail({ enter: afterPdShown,
      cognition: L("Was scheint die Panikanfälle auszulösen (innere Empfindungen, Situationen)?", "Qu'est-ce qui semble déclencher les attaques ?", "What seems to trigger the panic attacks (inner sensations, situations)?"),
      coping: L("Was tun Sie, wenn ein Panikanfall auftritt?", "Que faites-vous lors d'une attaque ?", "What do you do when a panic attack occurs?"),
      organic: { de: "Schilddrüsenprobleme, Schwangerschaft, niedriger Blutzucker, Mitralklappenprolaps", fr: "problèmes de thyroïde, grossesse, hypoglycémie, prolapsus mitral", en: "thyroid problems, pregnancy, low blood sugar, mitral valve prolapse" } }),
  ],
};

const MOD_AGORA: DipsModule = {
  id: "agora", code: "AG", color: PALETTE[2],
  title: L("Agoraphobie", "Agoraphobie", "Agoraphobia"), enter: agoraEnter,
  sections: [
    { id: "screen", title: L("Agoraphobie", "Agoraphobie", "Agoraphobia"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Gibt es Situationen, in denen Sie Angst haben (z. B. Autofahren, Schlange stehen, Kaufhäuser, Menschenmengen, enge geschlossene Räume)?", "Y a-t-il des situations où vous avez peur (p. ex. conduire, files d'attente, grands magasins, foules, espaces clos étroits) ?", "Are there situations in which you feel afraid (e.g. driving, queues, department stores, crowds, narrow enclosed spaces)?") },
      { id: "1.2", code: "1.2", type: "yesno", showIf: (m) => m["1.1"] === "yes", q: L("Vermeiden/fürchten Sie diese, weil ein Verlassen im Fall panikähnlicher oder peinlicher Symptome schwierig wäre?", "Les évitez-vous parce qu'il serait difficile de partir en cas de symptômes de panique ou gênants ?", "Do you avoid/fear these because leaving would be difficult if panic-like or embarrassing symptoms occurred?") },
      { id: "1.3", code: "1.3", type: "yesno", showIf: (m) => m["1.1"] === "yes", q: L("… oder weil Sie im Fall solcher Symptome nicht rechtzeitig Hilfe bekommen könnten?", "… ou parce que vous ne pourriez pas obtenir d'aide à temps ?", "… or because you could not get help in time if such symptoms occurred?") },
      { id: "1.4", code: "1.4", type: "yesno", showIf: (m) => m["1.1"] !== "yes", q: L("Gab es jemals eine Zeit mit Angst vor solchen Situationen?", "Y a-t-il déjà eu une période de peur de telles situations ?", "Was there ever a time of fearing such situations?") },
      { id: "1.5", code: "1.5", type: "yesno", showIf: (m) => m["1.4"] === "yes", q: L("Vermieden/fürchteten Sie diese wegen eines schwierigen Verlassens?", "Les évitiez-vous à cause d'un départ difficile ?", "Did you avoid/fear these because leaving would be difficult?") },
      { id: "1.6", code: "1.6", type: "yesno", showIf: (m) => m["1.4"] === "yes", q: L("… oder weil Sie keine rechtzeitige Hilfe bekommen könnten?", "… ou par crainte de ne pas obtenir d'aide à temps ?", "… or because you could not get help in time?") },
      { id: "companion", code: "2", type: "yesno", showIf: agoraEnter, q: L("Macht es einen Unterschied, ob Sie in Begleitung sind? Fühlen Sie sich mit bestimmten Personen sicherer?", "Cela change-t-il si vous êtes accompagné(e) ? Vous sentez-vous plus en sécurité avec certaines personnes ?", "Does it make a difference whether you are accompanied? Do you feel safer with certain people?") },
      { id: "grid", code: "3", type: "grid", showIf: agoraEnter, primaryLabel: T.fear, note: GRID_NOTE, q: L("Haben Sie Angst vor folgenden Situationen oder vermeiden Sie sie?", "Avez-vous peur des situations suivantes ou les évitez-vous ?", "Do you fear or avoid the following situations?"), groups: AGORA_SITUATIONS, cols: COLS_FEAR_AVOID },
      { id: "4", code: "4", type: "yesno", showIf: agoraEnter, q: L("Haben Sie fast jedes Mal Angst, wenn Sie in diesen Situationen sind?", "Avez-vous peur presque à chaque fois ?", "Do you feel afraid almost every time you are in these situations?") },
      { id: "safety", code: "5", type: "yesno_text", showIf: agoraEnter, q: L("Tragen Sie bestimmte Dinge bei sich oder tun Sie etwas, um sich in diesen Situationen wohler zu fühlen (z. B. Medikamente, Handy, Getränke)?", "Emportez-vous certaines choses ou faites-vous quelque chose pour vous sentir mieux (p. ex. médicaments, téléphone, boissons) ?", "Do you carry certain things or do something to feel more comfortable in these situations (e.g. medication, phone, drinks)?") },
    ] },
    mkTail({ enter: agoraEnter, duration6: true, appropriateness: true,
      cognition: L("Was denken Sie, könnte geschehen, wenn Sie in einer gemiedenen Situation festsitzen?", "Que pourrait-il se passer si vous étiez bloqué(e) dans une situation évitée ?", "What do you think could happen if you were stuck in an avoided situation?"),
      coping: L("Was tun Sie gewöhnlich, wenn Sie einen Anfall haben oder sehr ängstlich sind?", "Que faites-vous habituellement en cas d'attaque ou de forte peur ?", "What do you usually do when you have an attack or are very anxious?"),
      organic: { de: "Morbus Crohn, Colitis ulcerosa, Morbus Parkinson", fr: "maladie de Crohn, rectocolite, maladie de Parkinson", en: "Crohn's disease, ulcerative colitis, Parkinson's disease" } }),
  ],
};

const MOD_SOCIAL: DipsModule = {
  id: "social", code: "SAS", color: PALETTE[3],
  title: L("Soziale Angststörung (Soziale Phobie)", "Trouble d'anxiété sociale (phobie sociale)", "Social anxiety disorder (social phobia)"), enter: socEnter,
  sections: [
    { id: "screen", title: L("Soziale Angststörung", "Anxiété sociale", "Social anxiety"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Fühlen Sie sich sehr ängstlich oder besorgt in sozialen Situationen, in denen Sie beobachtet oder beurteilt werden könnten (z. B. Gespräch führen, vor anderen essen, eine Rede halten)?", "Vous sentez-vous très anxieux(se) dans des situations sociales où vous pourriez être observé(e) ou jugé(e) (p. ex. converser, manger devant d'autres, parler en public) ?", "Do you feel very anxious or worried in social situations where you might be observed or judged (e.g. having a conversation, eating in front of others, giving a talk)?") },
      { id: "1.2", code: "1.2", type: "yesno", showIf: (m) => m["1.1"] === "yes", q: L("Sorgen Sie sich stark, sich peinlich zu verhalten, sodass andere schlecht von Ihnen denken?", "Craignez-vous fortement de vous comporter de façon embarrassante et d'être mal jugé(e) ?", "Do you worry strongly that you might behave embarrassingly so that others think badly of you?") },
      { id: "1.3", code: "1.3", type: "yesno", showIf: (m) => m["1.1"] === "yes", q: L("Sorgen Sie sich, dass andere Ihre Aufregung bemerken (z. B. Erröten, Zittern)?", "Craignez-vous que les autres remarquent votre nervosité (p. ex. rougir, trembler) ?", "Do you worry that others notice your nervousness (e.g. blushing, trembling)?") },
      { id: "1.4", code: "1.4", type: "yesno", showIf: (m) => m["1.1"] !== "yes", q: L("Haben Sie sich jemals in solchen sozialen Situationen sehr ängstlich gefühlt?", "Vous êtes-vous déjà senti(e) très anxieux(se) dans de telles situations ?", "Have you ever felt very anxious in such social situations?") },
      { id: "1.5", code: "1.5", type: "yesno", showIf: (m) => m["1.4"] === "yes", q: L("Sorgten Sie sich stark, schlecht beurteilt zu werden?", "Craigniez-vous fortement d'être mal jugé(e) ?", "Did you worry strongly about being judged badly?") },
      { id: "1.6", code: "1.6", type: "yesno", showIf: (m) => m["1.4"] === "yes", q: L("… dass andere Ihre Aufregung bemerken?", "… que les autres remarquent votre nervosité ?", "… that others notice your nervousness?") },
      { id: "grid", code: "3", type: "grid", showIf: socEnter, primaryLabel: T.fear, note: GRID_NOTE, q: L("Haben Sie Angst vor folgenden sozialen Situationen oder vermeiden Sie sie?", "Avez-vous peur des situations sociales suivantes ou les évitez-vous ?", "Do you fear or avoid the following social situations?"), groups: SOCIAL_SITUATIONS, cols: COLS_FEAR_AVOID },
      { id: "4.2", code: "4.2", req: true, type: "yesno", showIf: socEnter, q: L("Dauern diese Angst und das Vermeidungsverhalten mindestens 6 Monate?", "Cette peur et l'évitement durent-ils au moins 6 mois ?", "Have this fear and avoidance lasted at least 6 months?") },
      { id: "6", code: "6", req: true, type: "yesno", showIf: socEnter, q: L("Tritt die Angst sofort auf, sobald Sie sich in die Situation begeben (oder wissen, dass Sie es werden)?", "La peur apparaît-elle immédiatement dès que vous êtes (ou allez être) dans la situation ?", "Does the anxiety arise immediately when you enter the situation (or know you will)?") },
    ] },
    mkTail({ enter: socEnter, appropriateness: true,
      cognition: L("Was befürchten Sie kurz vorher, währenddessen und danach in diesen Situationen?", "Que craignez-vous avant, pendant et après ces situations ?", "What do you fear shortly before, during, and after these situations?"),
      coping: L("Was tun Sie, um die Situationen zu bewältigen oder zu vermeiden?", "Que faites-vous pour gérer ou éviter ces situations ?", "What do you do to cope with or avoid these situations?"),
      organic: { de: "Schilddrüsenprobleme, neurologische Erkrankungen", fr: "problèmes de thyroïde, maladies neurologiques", en: "thyroid problems, neurological conditions" } }),
  ],
};

const MOD_PHOBIA: DipsModule = {
  id: "phobia", code: "SPP", color: PALETTE[4],
  title: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"), enter: phobiaEnter,
  sections: [
    { id: "screen", title: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Gibt es Situationen oder Objekte (z. B. Tiere, Höhen, Stürme, Wasser, Blut, Autofahren, medizinische Behandlungen), vor denen Sie sich intensiv fürchten?", "Y a-t-il des situations ou objets (p. ex. animaux, hauteurs, orages, eau, sang, conduite, soins médicaux) que vous craignez intensément ?", "Are there situations or objects (e.g. animals, heights, storms, water, blood, driving, medical procedures) that you fear intensely?") },
      { id: "1.2", code: "1.2", type: "yesno", showIf: (m) => m["1.1"] !== "yes", q: L("Gab es jemals solche Situationen oder Objekte?", "Y a-t-il déjà eu de telles situations ou objets ?", "Have there ever been such situations or objects?") },
      { id: "grid", code: "2", type: "grid", showIf: phobiaEnter, primaryLabel: T.fear, note: GRID_NOTE, q: L("Haben Sie starke Angst vor folgenden Dingen oder vermeiden Sie sie?", "Avez-vous très peur des éléments suivants ou les évitez-vous ?", "Do you have strong fear of, or avoid, the following?"), groups: PHOBIA_TYPES, cols: COLS_FEAR_AVOID },
      { id: "3", code: "3", type: "yesno", showIf: phobiaEnter, q: L("Tritt die Angst fast immer sofort auf, wenn Sie mit dem Objekt/der Situation konfrontiert sind?", "La peur apparaît-elle presque toujours immédiatement face à l'objet/la situation ?", "Does the fear arise almost always immediately on confrontation with the object/situation?") },
    ] },
    mkTail({ enter: phobiaEnter, duration6: true, appropriateness: true,
      cognition: L("Was befürchten Sie, das geschehen könnte?", "Que craignez-vous qu'il se passe ?", "What do you fear might happen?"),
      coping: L("Was tun Sie, um die gefürchteten Dinge zu vermeiden oder auszuhalten?", "Que faites-vous pour éviter ou supporter ces situations ?", "What do you do to avoid or endure the feared things?"),
      organic: { de: "neurologische Erkrankungen, Gleichgewichtsstörungen", fr: "maladies neurologiques, troubles de l'équilibre", en: "neurological conditions, balance disorders" } }),
  ],
};

const MOD_GAD: DipsModule = {
  id: "gad", code: "GAS", color: PALETTE[6],
  title: L("Generalisierte Angststörung", "Trouble d'anxiété généralisée", "Generalised anxiety disorder"), enter: gadEnter,
  sections: [
    { id: "screen", title: L("Generalisierte Angststörung", "Anxiété généralisée", "Generalised anxiety"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno", q: L("Waren Sie in den letzten 6 Monaten an der Mehrzahl der Tage sehr besorgt und ängstlich bezüglich verschiedener Dinge oder Alltagsangelegenheiten?", "Au cours des 6 derniers mois, avez-vous été très inquiet(e) la plupart des jours à propos de diverses choses ?", "Over the past 6 months, on most days, have you been very worried and anxious about various things or everyday matters?") },
      { id: "1.2", code: "1.2", type: "textarea", showIf: gadEnter, q: L("Welche Sorgen/Ängste waren das?", "Quelles inquiétudes ?", "What worries/fears were these?") },
      { id: "1.3", code: "1.3", req: true, type: "yesno", showIf: gadEnter, q: L("Ist es schwierig, die Sorgen zu kontrollieren oder zu beenden, bzw. drängen sie sich auf, wenn Sie sich abzulenken versuchen?", "Est-il difficile de contrôler ou d'arrêter ces inquiétudes, ou s'imposent-elles malgré vous ?", "Is it difficult to control or stop the worries, or do they intrude when you try to distract yourself?") },
      { id: "worries", code: "3", type: "grid", showIf: gadEnter, primaryLabel: T.worry, note: L("Geben Sie an, ob Sie sich in diesen Bereichen sorgen; falls ja, erscheinen Ausprägung und Unkontrollierbarkeit.", "Indiquez si vous vous inquiétez dans ces domaines ; si oui, l'intensité et l'incontrôlabilité apparaissent.", "Indicate whether you worry in these domains; if so, intensity and uncontrollability appear."),
        q: L("Sorgen Sie sich über folgende Bereiche?", "Vous inquiétez-vous des domaines suivants ?", "Do you worry about the following domains?"), groups: GAD_WORRIES, cols: [{ key: "expr", kind: "sev03", label: T.expr }, { key: "unc", kind: "sev03", label: T.uncontrol }] },
      { id: "symptoms", code: "6", type: "grid", showIf: gadEnter, primaryLabel: T.present, note: GRID_NOTE, q: L("Erlebten Sie in den letzten 6 Monaten folgende Symptome zusammen mit den Sorgen?", "Au cours des 6 derniers mois, avez-vous éprouvé ces symptômes avec les inquiétudes ?", "Over the past 6 months, did you experience these symptoms together with the worries?"), groups: [{ rows: GAD_SYMPTOMS }], cols: [{ key: "sev", kind: "sev03", label: T.severity }, { key: "maj", kind: "yesno", label: T.majorityDays }] },
    ] },
    mkTail({ enter: gadFull,
      cognition: L("Was löst typischerweise Ihre Sorgen aus (z. B. bestimmte Situationen oder Aktivitäten)?", "Qu'est-ce qui déclenche typiquement vos inquiétudes ?", "What typically triggers your worries (e.g. certain situations or activities)?"),
      coping: L("Tun Sie aufgrund Ihrer Sorgen etwas, um sich zu beruhigen oder die Anspannung zu reduzieren?", "Faites-vous quelque chose pour vous calmer ou réduire la tension ?", "Do you do anything because of your worries to calm yourself or reduce the tension?"),
      organic: { de: "Schilddrüsenüberfunktion, Herz-Kreislauf-Erkrankungen", fr: "hyperthyroïdie, maladies cardiovasculaires", en: "hyperthyroidism, cardiovascular conditions" } }),
  ],
};

const MOD_SEP: DipsModule = {
  id: "sep", code: "STA", color: PALETTE[5],
  title: L("Störung mit Trennungsangst", "Trouble d'anxiété de séparation", "Separation anxiety disorder"), enter: sepEnter,
  sections: [
    { id: "screen", title: L("Störung mit Trennungsangst", "Anxiété de séparation", "Separation anxiety"), items: [
      { id: "1.1", code: "1.1", req: true, type: "yesno_text", q: L("Haben Sie starke Angst davor, sich von Ihnen nahestehenden Personen zu trennen oder getrennt zu werden (z. B. Eltern, Partner, Kinder)?", "Avez-vous très peur d'être séparé(e) de proches (p. ex. parents, partenaire, enfants) ?", "Do you have strong fear of separating, or being separated, from people close to you (e.g. parents, partner, children)?") },
      { id: "1.3", code: "1.3", type: "yesno", showIf: (m) => m["1.1"] !== "yes", q: L("Gab es jemals solche Zeiten?", "Y a-t-il déjà eu de telles périodes ?", "Has there ever been such a time?") },
      { id: "symptoms", code: "2", type: "grid", showIf: sepEnter, primaryLabel: T.present, note: GRID_NOTE, q: L("Treffen folgende Symptome auf Sie zu? Fürchten oder vermeiden Sie diese Situationen?", "Les symptômes suivants vous concernent-ils ? Craignez-vous ou évitez-vous ces situations ?", "Do the following apply to you? Do you fear or avoid these situations?"), groups: [{ rows: SEP_SYMPTOMS }], cols: COLS_FEAR_AVOID },
      { id: "3", code: "3", type: "yesno", showIf: sepEnter, q: L("Haben Sie fast jedes Mal Angst, wenn Sie in diesen Situationen sind?", "Avez-vous peur presque à chaque fois ?", "Do you feel afraid almost every time you are in these situations?") },
      { id: "4.2", code: "4.2", req: true, type: "yesno", showIf: sepEnter, q: L("Dauern diese Angst und das Vermeidungsverhalten mindestens 6 Monate an?", "Cette peur et l'évitement durent-ils au moins 6 mois ?", "Have this fear and avoidance lasted at least 6 months?") },
    ] },
    mkTail({ enter: sepFull,
      cognition: L("Was befürchten Sie, das bei einer Trennung geschehen könnte?", "Que craignez-vous qu'il se passe lors d'une séparation ?", "What do you fear might happen upon separation?"),
      coping: L("Was tun Sie, um Trennungen zu vermeiden oder damit umzugehen?", "Que faites-vous pour éviter les séparations ou y faire face ?", "What do you do to avoid or cope with separations?"),
      organic: { de: "neurologische oder internistische Erkrankungen", fr: "maladies neurologiques ou internes", en: "neurological or internal-medical conditions" } }),
  ],
};

export const MODULES: DipsModule[] = [MOD_PANIC, MOD_AGORA, MOD_SOCIAL, MOD_PHOBIA, MOD_GAD, MOD_SEP];
