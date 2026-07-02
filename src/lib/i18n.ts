// Minimal i18n: a node is either a plain string or a {de,fr,en} record.
export type Lang = "de" | "fr" | "en";
export type LangNode = string | { de: string; fr: string; en: string };

export const L = (de: string, fr: string, en: string): LangNode => ({ de, fr, en });

export const tr = (node: LangNode | undefined | null, lang: Lang): string => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  return node[lang] ?? node.de ?? "";
};

export const LANGS: { id: Lang; label: string }[] = [
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];

// UI chrome + shared question scaffolding strings.
export const T = {
  assessmentTitle: L("Erstgespräch – Aufnahme", "Entretien initial – admission", "Intake assessment"),
  assessmentIntro: L(
    "Diese Aufnahme erfasst einige persönliche Angaben und ein strukturiertes Screening zu Angststörungen (DIPS). Es werden mehrere Bereiche kurz angefragt; ausführlichere Fragen erscheinen nur, wenn ein Bereich auf Sie zutrifft. Ihre Antworten werden an Ihre Therapeutin / Ihren Therapeuten weitergegeben.",
    "Cette admission recueille quelques informations personnelles et un dépistage structuré des troubles anxieux (DIPS). Plusieurs domaines sont brièvement abordés ; des questions plus détaillées n'apparaissent que si un domaine vous concerne. Vos réponses sont transmises à votre thérapeute.",
    "This intake collects some personal details and a structured screening for anxiety disorders (DIPS). Several areas are briefly screened; more detailed questions appear only if an area applies to you. Your answers are shared with your therapist."),
  personalDetails: L("Persönliche Angaben", "Informations personnelles", "Personal details"),
  personalNote: L("Aufnahmebogen – wird vor dem Erstgespräch ausgefüllt.", "Fiche d'admission – à remplir avant l'entretien initial.", "Intake cover sheet — completed before the first appointment."),
  yes: L("Ja", "Oui", "Yes"), no: L("Nein", "Non", "No"),
  describe: L("Beschreiben", "Décrivez", "Please describe"), optional: L("optional", "facultatif", "optional"),
  from: L("Von (Mt./J.)", "De (mois/année)", "From (mo./yr.)"), to: L("bis (Mt./J.)", "à (mois/année)", "to (mo./yr.)"),
  date: L("Datum", "Date", "Date"),
  perMonth: L("Durchschnittliche Häufigkeit pro Monat", "Fréquence moyenne par mois", "Average frequency per month"),
  present: L("Vorhanden?", "Présent ?", "Present?"),
  fear: L("Angst", "Peur", "Fear"), avoid: L("Vermeidung", "Évitement", "Avoidance"),
  worry: L("Sorgen", "Inquiétude", "Worry"), expr: L("Ausprägung", "Intensité", "Intensity"),
  uncontrol: L("Unkontrollierbarkeit", "Incontrôlabilité", "Uncontrollability"),
  majorityDays: L("An den meisten Tagen?", "La plupart des jours ?", "Most days?"),
  severity: L("Schweregrad", "Sévérité", "Severity"),
  sev03: L("0 = keine · 1 = leichte · 2 = starke · 3 = sehr starke", "0 = aucune · 1 = légère · 2 = forte · 3 = très forte", "0 = none · 1 = mild · 2 = strong · 3 = very strong"),
  submit: L("Aufnahme absenden", "Envoyer l'admission", "Submit assessment"), back: L("Zurück", "Retour", "Back"),
  required: L("Pflichtfelder sind mit * markiert.", "Les champs obligatoires sont marqués d'un *.", "Fields marked * are required."),
  answerAll: L("Bitte beantworten Sie alle sichtbaren Pflichtfragen.", "Veuillez répondre à toutes les questions obligatoires affichées.", "Please answer every required question shown."),
  skipNote: L("Aufgrund Ihrer Antworten sind einige Fragen für Sie nicht relevant und werden übersprungen.", "Selon vos réponses, certaines questions ne vous concernent pas et sont ignorées.", "Based on your answers, some questions don't apply and are skipped."),
  langPrompt: L("Sprache", "Langue", "Language"),
  notApplicable: L("Dieser Bereich trifft auf Sie nicht zu — keine weiteren Fragen.", "Ce domaine ne vous concerne pas — pas d'autres questions.", "This area does not apply to you — no further questions."),
  age: L("Alter", "Âge", "Age"), sex: L("Geschlecht", "Sexe", "Sex"), nationality: L("Nationalität", "Nationalité", "Nationality"),
  city: L("Wohnort", "Lieu de résidence", "City / place of residence"), occupation: L("Beruf", "Profession", "Occupation"),
  living: L("Wohnsituation", "Situation de logement", "Living situation"), siblings: L("Geschwister (Anzahl & Position)", "Fratrie (nombre & position)", "Siblings (number & position)"),
  select: L("Bitte wählen…", "Sélectionner…", "Select…"),
  sexOpts: [L("Weiblich", "Féminin", "Female"), L("Männlich", "Masculin", "Male"), L("Divers", "Non-binaire", "Non-binary"), L("Keine Angabe", "Préfère ne pas répondre", "Prefer not to say")],
  livingOpts: [L("Allein", "Seul(e)", "Alone"), L("Mit Partner*in", "Avec partenaire", "With partner"), L("Mit Familie", "Avec la famille", "With family"), L("Wohngemeinschaft", "Colocation", "Shared flat"), L("Andere", "Autre", "Other")],
  siblingsPlaceholder: L("z. B. 2 – mittleres Kind", "p. ex. 2 – enfant du milieu", "e.g. 2 — middle child"),
  sending: L("Wird an den Server gesendet…", "Envoi au serveur…", "Sending to server…"),
  sentOk: L("Gespeichert und an den Server übermittelt.", "Enregistré et transmis au serveur.", "Saved and submitted to the server."),
  sentLocal: L("Lokal gespeichert (Server nicht erreichbar) — kann erneut gesendet werden.", "Enregistré localement (serveur injoignable) — peut être renvoyé.", "Saved locally (server unreachable) — can be resent."),
  retry: L("Erneut senden", "Renvoyer", "Resend"),
  viewPayload: L("Gesendete Daten anzeigen (FHIR)", "Afficher les données envoyées (FHIR)", "View submitted data (FHIR)"),
};
