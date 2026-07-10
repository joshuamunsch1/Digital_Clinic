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

// --- App-wide UI strings (batch-2 i18n: DE default, FR/EN) ----------------------
// Instrument names, scale labels and validated item wording (PSTB) are NOT
// translated here — they are clinical content stored on the instrument records.
export const UI = {
  // login & registration
  appTagline: L("Plattform für Therapieverlauf", "Plateforme de suivi thérapeutique", "Therapy progress platform"),
  loginLead: L("Melden Sie sich mit E-Mail und Passwort an", "Connectez-vous avec votre e-mail et mot de passe", "Sign in with your e-mail and password"),
  email: L("E-Mail", "E-mail", "E-mail"),
  password: L("Passwort", "Mot de passe", "Password"),
  signIn: L("Anmelden", "Se connecter", "Sign in"),
  signingIn: L("Anmeldung…", "Connexion…", "Signing in…"),
  invalidCredentials: L("E-Mail oder Passwort ist falsch.", "E-mail ou mot de passe incorrect.", "E-mail or password is incorrect."),
  registerCta: L("Neu bei uns? Als Patient*in registrieren", "Nouveau chez nous ? S'inscrire comme patient·e", "New here? Register as a patient"),
  registerTitle: L("Willkommen bei der Volksklinik", "Bienvenue à la Volksklinik", "Welcome to Volksklinik"),
  registerIntro: L(
    "Schön, dass Sie da sind. Erstellen Sie Ihr persönliches Konto — Ihre Angaben helfen uns, Sie gut zu begleiten. Nach der Registrierung meldet sich die Klinik bei Ihnen für das Erstgespräch.",
    "Nous sommes heureux de vous accueillir. Créez votre compte personnel — vos informations nous aident à bien vous accompagner. Après l'inscription, la clinique vous contactera pour le premier entretien.",
    "We're glad you're here. Create your personal account — your details help us take good care of you. After registering, the clinic will contact you to arrange your first appointment."),
  fullName: L("Vollständiger Name", "Nom complet", "Full name"),
  passwordRepeat: L("Passwort wiederholen", "Répéter le mot de passe", "Repeat password"),
  passwordMismatch: L("Die Passwörter stimmen nicht überein.", "Les mots de passe ne correspondent pas.", "The passwords do not match."),
  passwordTooShort: L("Das Passwort braucht mindestens 8 Zeichen.", "Le mot de passe doit contenir au moins 8 caractères.", "The password needs at least 8 characters."),
  emailTaken: L("Für diese E-Mail existiert bereits ein Konto.", "Un compte existe déjà pour cet e-mail.", "An account already exists for this e-mail."),
  aboutYou: L("Ein paar Angaben zu Ihnen (freiwillig)", "Quelques informations sur vous (facultatif)", "A few details about you (optional)"),
  createAccount: L("Konto erstellen", "Créer le compte", "Create account"),
  creatingAccount: L("Konto wird erstellt…", "Création du compte…", "Creating account…"),
  backToLogin: L("Zurück zur Anmeldung", "Retour à la connexion", "Back to sign-in"),
  demoAccounts: L("Demo-Zugänge anzeigen", "Afficher les comptes de démonstration", "Show demo accounts"),
  registerPrivacyNote: L(
    "Prototyp: Bitte keine echten Personendaten eingeben.",
    "Prototype : veuillez ne pas saisir de données personnelles réelles.",
    "Prototype: please do not enter real personal data."),
  loginFooter: L(
    "Prototyp mit fiktiven Demodaten · nicht für echte Patientendaten",
    "Prototype avec données de démonstration fictives · pas pour de vraies données de patients",
    "Prototype with fictional demo data · not for real patient records"),

  // shell
  rolePatient: L("Patient*in", "Patient·e", "Patient"),
  roleTherapist: L("Therapeut*in", "Thérapeute", "Therapist"),
  roleDirector: L("Klinikleitung", "Direction de la clinique", "Clinic director"),
  roleAdmin: L("Administration", "Administration", "Administrator"),
  signOut: L("Abmelden", "Se déconnecter", "Sign out"),
  resetDemo: L("Demodaten zurücksetzen", "Réinitialiser les données démo", "Reset demo data"),
  confirmReset: L("Zurücksetzen bestätigen", "Confirmer la réinitialisation", "Confirm reset"),
  cancel: L("Abbrechen", "Annuler", "Cancel"),
  loading: L("Wird geladen…", "Chargement…", "Loading…"),
  loadingClinic: L("Klinikdaten werden geladen…", "Chargement des données de la clinique…", "Loading clinic data…"),
  networkRestricted: L(
    "Klinikdaten sind nur aus dem Kliniknetzwerk erreichbar (direkt oder per VPN). Bitte verbinden Sie sich und laden Sie die Seite neu.",
    "Les données de la clinique ne sont accessibles que depuis le réseau de la clinique (directement ou via VPN). Veuillez vous connecter puis recharger la page.",
    "Clinic data is only accessible from the clinic network (directly or via VPN). Please connect and reload the page."),

  // statuses & categories
  statusAssessment: L("Aufnahme ausstehend", "Admission en attente", "Assessment due"),
  statusInterview: L("Wartet auf Erstgespräch", "En attente du premier entretien", "Awaiting intake interview"),
  statusTherapy: L("In Therapie", "En thérapie", "In therapy"),
  catAnxiety: L("Angststörungen", "Troubles anxieux", "Anxiety"),
  catDepression: L("Depression", "Dépression", "Depression"),
  catEating_disorder: L("Essstörungen", "Troubles alimentaires", "Eating disorder"),
  catAdhd: L("ADHS", "TDAH", "ADHD"),
  catBurnout: L("Burnout / Erschöpfung", "Burnout / épuisement", "Burnout"),
  catOther: L("Andere", "Autre", "Other"),
  allDisorders: L("Alle Störungsbilder", "Tous les troubles", "All disorders"),

  // dashboard
  myPatients: L("Meine Patient*innen", "Mes patient·e·s", "My patients"),
  myPatientsSub: L("Ihnen zugewiesene Patient*innen", "Patient·e·s qui vous sont attribué·e·s", "Patients assigned to you"),
  clinicOverview: L("Klinikübersicht", "Vue d'ensemble de la clinique", "Clinic overview"),
  clinicOverviewSub: L("Alle Patient*innen und Therapeut*innen der Klinik", "Tou·te·s les patient·e·s et thérapeutes de la clinique", "All patients and therapists of the clinic"),
  adminOverviewSub: L("Registrierung und Zuweisung — ohne klinische Daten", "Enregistrement et attribution — sans données cliniques", "Registration and assignment — without clinical data"),
  statPatients: L("Patient*innen", "Patient·e·s", "Patients"),
  statInTherapy: L("In Therapie", "En thérapie", "In therapy"),
  statAwaiting: L("Vor Erstgespräch", "Avant le premier entretien", "Awaiting intake"),
  statAvgProgress: L("Ø Therapiefortschritt", "Progrès thérapeutique moyen", "Avg. therapy progress"),
  patientDevelopment: L("Therapieverlauf", "Évolution thérapeutique", "Patient development"),
  patientDevelopmentSub: L(
    "Verlauf pro Patient*in über die Messzeitpunkte — Instrument, Skala und Störungsbild wählbar.",
    "Évolution par patient·e au fil des mesures — instrument, échelle et catégorie de trouble sélectionnables.",
    "Per-patient course across measurement occasions — instrument, scale and disorder category selectable."),
  scoresOverview: L("Fragebogen-Übersicht", "Aperçu des questionnaires", "Questionnaire scores"),
  scoresOverviewSub: L(
    "Aktuellster Wert der Hauptskala je Instrument und Patient*in. Klicken Sie auf eine Zeile für Details.",
    "Dernière valeur de l'échelle principale par instrument et patient·e. Cliquez sur une ligne pour les détails.",
    "Latest primary-scale value per instrument and patient. Click a row for details."),
  colPatient: L("Patient*in", "Patient·e", "Patient"),
  sectionUnassigned: L("Neu registriert — nicht zugewiesen", "Nouvellement inscrit·e·s — non attribué·e·s", "New registrations — unassigned"),
  sectionAssigned: L("Zugewiesen — Abklärungsphase", "Attribué·e·s — phase d'évaluation", "Assigned — intake phase"),
  sectionInTherapy: L("In Therapie", "En thérapie", "In therapy"),
  assign: L("zuweisen", "attribuer", "assign"),
  unassigned: L("Nicht zugewiesen", "Non attribué·e", "Unassigned"),
  needsAssignment: L("← zuweisen", "← attribuer", "← assign"),
  therapistsTitle: L("Therapeut*innen", "Thérapeutes", "Therapists"),
  caseloadSub: L("Fallzahl pro Therapeut*in", "Nombre de cas par thérapeute", "Caseload per therapist"),
  registerPatientTitle: L("Patient*in manuell registrieren", "Enregistrer un·e patient·e manuellement", "Register a new patient"),
  registerPatientSub: L(
    "Patient*innen registrieren sich normalerweise selbst über die Startseite. Hier können Sie zusätzlich manuell registrieren.",
    "Les patient·e·s s'inscrivent normalement eux-mêmes via la page d'accueil. Vous pouvez aussi enregistrer manuellement ici.",
    "Patients normally self-register from the start page. You can additionally register someone manually here."),
  register: L("Registrieren", "Enregistrer", "Register"),
  noPatientsAssigned: L("Ihnen sind noch keine Patient*innen zugewiesen.", "Aucun·e patient·e ne vous est encore attribué·e.", "No patients assigned to you yet."),
  nonInThisCategory: L("Keine Patient*innen in dieser Kategorie.", "Aucun·e patient·e dans cette catégorie.", "No patients in this category."),
  patientsCount: L("Patient*in(nen)", "patient·e·s", "patient(s)"),

  // patient detail
  backToOverview: L("← Zurück zur Übersicht", "← Retour à la vue d'ensemble", "← Back to overview"),
  questionnairesOnFile: L("Fragebogen im Dossier", "questionnaires au dossier", "questionnaire(s) on file"),
  noQuestionnairesYet: L("noch keine Fragebogen", "pas encore de questionnaires", "no questionnaires yet"),
  latestProgress: L("Therapiefortschritt (letzte Sitzung)", "Progrès (dernière séance)", "latest session progress"),
  therapistLabel: L("Therapeut*in:", "Thérapeute :", "Therapist:"),
  demographicsTitle: L("Demografie & persönliche Angaben", "Démographie et informations personnelles", "Demographics & personal information"),
  noIntakeYet: L("Die Aufnahme wurde noch nicht ausgefüllt.", "L'admission n'a pas encore été remplie.", "The patient has not completed intake yet."),
  diagnosisTitle: L("Diagnose", "Diagnostic", "Diagnosis"),
  recordedOn: L("Erfasst", "Enregistré le", "Recorded"),
  diagnosisAfterIntake: L("Die Diagnose wird nach dem Erstgespräch erfasst.", "Le diagnostic est enregistré après le premier entretien.", "A diagnosis is recorded after the intake interview."),
  diagnosisPrompt: L(
    "Aufnahme erhalten. Erfassen Sie die Diagnose aus dem Erstgespräch, um die Therapie zu starten.",
    "Admission reçue. Enregistrez le diagnostic du premier entretien pour démarrer la thérapie.",
    "Intake received. Record the diagnosis from the interview to start therapy."),
  diagnosisPlaceholder: L("Diagnose aus dem Erstgespräch…", "Diagnostic du premier entretien…", "Diagnosis from intake interview…"),
  disorderCategoryLabel: L("Störungsbild (für Filter)", "Catégorie de trouble (pour filtres)", "Disorder category (for filtering)"),
  saveDiagnosis: L("Diagnose speichern & Therapie starten", "Enregistrer le diagnostic et démarrer la thérapie", "Save diagnosis & start therapy"),
  dipsTitle: L("DIPS · Angst-Screening (Selbstbericht)", "DIPS · Dépistage de l'anxiété (auto-évaluation)", "DIPS · Anxiety screening (self-report)"),
  summaryTitle: L("Fragebogen-Kurzübersicht", "Aperçu des questionnaires", "Questionnaire summary"),
  summarySub: L(
    "Aktuellster Wert der Hauptskala je Instrument, normiert auf den Wertebereich. Grün = klinisch günstige Richtung.",
    "Dernière valeur de l'échelle principale par instrument, normalisée sur l'étendue. Vert = évolution cliniquement favorable.",
    "Latest primary-scale value per instrument, normalized to its range. Green = clinically favourable direction."),
  clinicalAlert: L("Klinischer Hinweis", "Alerte clinique", "Clinical alert"),
  collectTitle: L("Fragebogen erheben", "Recueillir un questionnaire", "Collect a questionnaire"),
  instrumentLabel: L("Instrument", "Instrument", "Instrument"),
  ratedBy: L("Beurteilt durch", "Évalué par", "Rated by"),
  waveLabel: L("Messzeitpunkt", "Temps de mesure", "Measurement wave"),
  dateAdministered: L("Erhebungsdatum", "Date de passation", "Date administered"),
  inviteHeading: L("LimeSurvey-Link per E-Mail senden", "Envoyer le lien LimeSurvey par e-mail", "Send LimeSurvey link by e-mail"),
  recipientEmail: L("Empfänger-E-Mail", "E-mail du destinataire", "Recipient e-mail"),
  surveyIdLinked: L("LimeSurvey-Umfrage-ID (verknüpft: {id})", "ID du sondage LimeSurvey (lié : {id})", "LimeSurvey survey id (linked: {id})"),
  surveyIdUnlinked: L("LimeSurvey-Umfrage-ID (noch nicht verknüpft)", "ID du sondage LimeSurvey (pas encore lié)", "LimeSurvey survey id (not linked yet)"),
  sendInvitation: L("Einladung senden", "Envoyer l'invitation", "Send invitation"),
  inviteHint: L(
    "Sendet den persönlichen Umfrage-Link über den LimeSurvey-Mailer. Erinnerungen unten in der Liste.",
    "Envoie le lien personnel via le mailer LimeSurvey. Rappels dans la liste ci-dessous.",
    "Sends the personal survey link through LimeSurvey's mailer. Reminders can be sent from the list below."),
  haveAnswers: L("Antworten bereits vorhanden?", "Réponses déjà disponibles ?", "Already have the answers?"),
  csvPlaceholder: L(
    "LimeSurvey-CSV-Export hier einfügen (Spalten = Fragencodes, z. B. {code}, …)",
    "Collez ici l'export CSV LimeSurvey (colonnes = codes de questions, p. ex. {code}, …)",
    "Paste a LimeSurvey CSV response export here (headers = question codes, e.g. {code}, …)"),
  importCsv: L("CSV importieren", "Importer le CSV", "Import CSV"),
  manualEntry: L("Manuelle Eingabe (Papierbogen)", "Saisie manuelle (papier)", "Manual entry (paper form)"),
  itemsNotVerified: L(
    "Die Item-Liste dieses Instruments ist noch nicht verifiziert — Importe können noch nicht interpretiert werden.",
    "La liste d'items de cet instrument n'est pas encore vérifiée — les imports ne peuvent pas encore être interprétés.",
    "This instrument's item list is not verified yet — imports can't be interpreted until the definition is completed."),
  invitationsTitle: L("Fragebogen-Einladungen (LimeSurvey)", "Invitations aux questionnaires (LimeSurvey)", "Questionnaire invitations (LimeSurvey)"),
  syncNow: L("Abgeschlossene Antworten jetzt abholen", "Récupérer les réponses terminées", "Sync completed responses now"),
  working: L("Läuft…", "En cours…", "Working…"),
  sendReminder: L("Erinnerung senden", "Envoyer un rappel", "Send reminder"),
  reminderSent: L("Erinnerung gesendet.", "Rappel envoyé.", "Reminder sent."),
  invitationCreated: L("Einladung erstellt — Status siehe Liste unten.", "Invitation créée — statut dans la liste ci-dessous.", "Invitation created — check its status below."),
  noDataYet: L(
    "Noch keine Fragebogendaten — senden Sie eine Einladung, importieren Sie ein CSV oder erfassen Sie einen Papierbogen.",
    "Pas encore de données — envoyez une invitation, importez un CSV ou saisissez un questionnaire papier.",
    "No questionnaire data yet — send an invitation, import a CSV, or enter a paper form above."),
  responsesN: L("Antworten", "réponses", "response(s)"),
  viewIndividual: L("Einzelne Fragebogen anzeigen ▼", "Afficher les questionnaires individuels ▼", "View individual questionnaires ▼"),
  hideIndividual: L("Einzelne Fragebogen ausblenden ▲", "Masquer les questionnaires individuels ▲", "Hide individual questionnaires ▲"),
  viewAnswers: L("Antworten anzeigen ▼", "afficher les réponses ▼", "view answers ▼"),
  hideAnswers: L("Antworten ausblenden ▲", "masquer les réponses ▲", "hide answers ▲"),
  via: L("via", "via", "via"),
  reverseScored: L("(umgepolt)", "(inversé)", "(reverse-scored)"),
  computedScores: L("Berechnete Werte", "Scores calculés", "Computed scores"),
  notScored: L(
    "Für dieses Instrument werden noch keine Werte berechnet — die Auswertungsdefinition ist nicht verifiziert (Status: {status}). Rohantworten werden gespeichert.",
    "Aucun score n'est encore calculé pour cet instrument — la définition de cotation n'est pas vérifiée (statut : {status}). Les réponses brutes sont enregistrées.",
    "Scores are not computed for this instrument yet — its scoring definition has not been verified (status: {status}). Raw responses are stored."),
  definitionBadge: L("Definition {status}", "définition {status}", "definition {status}"),
  notesTitle: L("Notizen der Patient*innen aus den Stundenbogen", "Notes des patient·e·s (questionnaires de séance)", "Patient notes from session questionnaires"),
  sessionN: L("Sitzung", "Séance", "Session"),
  noteQuote: L("Notiz", "Note", "Note"),
  scaleCol: L("Skala", "Échelle", "Scale"),
  rciLegend: L(
    "▲ / ▼ = reliable Veränderung gegenüber der Erstmessung (RCI, 95%). Achtung: Reliabilitäts-/SD-Werte sind Platzhalter — vor klinischer Nutzung anhand des Manuals prüfen.",
    "▲ / ▼ = changement fiable par rapport à la première mesure (RCI, 95%). Attention : les paramètres sont des valeurs provisoires — à vérifier dans le manuel avant usage clinique.",
    "▲ / ▼ = reliable change vs. the first measurement (RCI, 95%). Note: reliability/SD parameters are placeholders — verify against the manual before clinical use."),
  lineStylesNote: L("Linienstile unterscheiden Beurteiler*innen:", "Les styles de ligne distinguent les évaluateurs :", "Line styles distinguish raters:"),
  noScoredResponses: L("Noch keine ausgewerteten Antworten.", "Pas encore de réponses cotées.", "No scored responses yet."),
  therapyBegins: L("Therapiebeginn", "début de la thérapie", "therapy begins"),
  rangeAssumedNote: L(
    "Hinweis: Die angezeigte Antwortskala dieses Instruments ist eine Annahme (in den Altdaten nicht dokumentiert). Vor klinischer Nutzung anhand des Manuals prüfen.",
    "Remarque : l'échelle de réponse affichée est une hypothèse (non documentée dans les anciennes données). À vérifier dans le manuel avant usage clinique.",
    "Note: the response scale shown for this instrument is an assumption (the legacy data did not record it). Verify against the instrument manual before clinical use."),
  submitBtn: L("Absenden", "Envoyer", "Submit"),
  savingBtn: L("Speichern…", "Enregistrement…", "Saving…"),
  backBtn: L("Zurück", "Retour", "Back"),
  answerAllItems: L("Bitte beantworten Sie alle Fragen.", "Veuillez répondre à toutes les questions.", "Please answer every item."),
  sessionNote: L(
    "Möchten Sie Ihrer Therapeutin / Ihrem Therapeuten etwas aus dieser Woche mitteilen? (freiwillig)",
    "Souhaitez-vous partager quelque chose de cette semaine avec votre thérapeute ? (facultatif)",
    "Anything from this week you'd like your therapist to know? (optional)"),

  // document timeline (document titles themselves are German clinical content,
  // stored on the rows — see DOC_TITLES_DE in src/lib/document-types.ts)
  documentsTitle: L("Dokumente im Therapieverlauf", "Documents du parcours thérapeutique", "Therapy-course documents"),
  documentsSub: L(
    "Chronologische Ablage — Standarddokumente der Klinik und eigene Uploads.",
    "Classement chronologique — documents standard de la clinique et téléversements propres.",
    "Chronological record — the clinic's standard documents plus your own uploads."),
  standardDocsCount: L("{n}/{total} Standarddokumente vorhanden", "{n}/{total} documents standard présents", "{n}/{total} standard documents on file"),
  docPending: L("Ausstehend", "En attente", "Pending"),
  fileTemplate: L("Vorlage ablegen", "Déposer le modèle", "File template"),
  uploadFile: L("Datei hochladen", "Téléverser un fichier", "Upload file"),
  uploadConfirm: L("Hochladen", "Téléverser", "Upload"),
  addOwnDocument: L("Eigenes Dokument hinzufügen", "Ajouter un document", "Add your own document"),
  docTypeLabel: L("Dokumenttyp", "Type de document", "Document type"),
  docTitleLabel: L("Titel", "Titre", "Title"),
  docDateLabel: L("Datum", "Date", "Date"),
  docNoteLabel: L("Notiz (optional)", "Note (facultatif)", "Note (optional)"),
  docFileHint: L("PDF, PNG oder JPEG · max. 10 MB", "PDF, PNG ou JPEG · max. 10 Mo", "PDF, PNG or JPEG · max 10 MB"),
  openDoc: L("Öffnen", "Ouvrir", "Open"),
  editDoc: L("Bearbeiten", "Modifier", "Edit"),
  deleteDoc: L("Löschen", "Supprimer", "Delete"),
  confirmDeleteDoc: L("Dieses Dokument wirklich löschen?", "Supprimer vraiment ce document ?", "Really delete this document?"),
  saveBtn: L("Speichern", "Enregistrer", "Save"),
  docAdded: L("Dokument abgelegt.", "Document déposé.", "Document filed."),
  docUpdated: L("Dokument aktualisiert.", "Document mis à jour.", "Document updated."),
  docDeleted: L("Dokument gelöscht.", "Document supprimé.", "Document deleted."),
  uploadedByLabel: L("abgelegt von", "déposé par", "filed by"),

  // patient home
  welcome: L("Willkommen, {name}", "Bienvenue, {name}", "Welcome, {name}"),
  yourTherapist: L("Ihre Therapeutin / Ihr Therapeut: {name}", "Votre thérapeute : {name}", "Your therapist: {name}"),
  introSoon: L("Sie werden bald Ihrer Therapeutin / Ihrem Therapeuten vorgestellt.", "Vous serez bientôt présenté·e à votre thérapeute.", "You will be introduced to your therapist soon."),
  thankYouSaved: L("Vielen Dank — Ihre Antworten wurden gespeichert und der Klinik übermittelt.", "Merci — vos réponses ont été enregistrées et transmises à la clinique.", "Thank you — your answers were saved and shared with the clinic."),
  todo: L("Zu erledigen", "À faire", "To do"),
  todoAfterSession: L("Nach jeder Sitzung auszufüllen", "À remplir après chaque séance", "To do after each session"),
  intakeTitle: L("Aufnahme & DIPS-Angst-Screening", "Admission et dépistage DIPS", "Intake & DIPS anxiety screening"),
  intakeDesc: L(
    "Bitte vor dem ersten Termin ausfüllen. Enthält einen kurzen persönlichen Teil und ein strukturiertes Angst-Screening in Ihrer Sprache.",
    "À remplir avant votre premier rendez-vous. Comprend une courte partie personnelle et un dépistage structuré de l'anxiété dans votre langue.",
    "Please complete this before your first appointment. It includes a short personal section and a structured anxiety screening in your language."),
  startIntake: L("Aufnahme starten", "Commencer l'admission", "Start intake"),
  sessionFormDesc: L(
    "Bitte füllen Sie diesen Stundenbogen nach jeder Therapiesitzung aus, damit Ihre Therapeutin / Ihr Therapeut Ihren Verlauf verfolgen kann.",
    "Veuillez remplir ce questionnaire après chaque séance afin que votre thérapeute puisse suivre votre évolution.",
    "Please fill this out after each therapy session so your therapist can follow how you are doing."),
  startSessionForm: L("Stundenbogen ausfüllen", "Remplir le questionnaire", "Start check-in"),
  nothingTodo: L("Im Moment nichts auszufüllen", "Rien à remplir pour le moment", "Nothing to fill out right now"),
  nothingTodoDesc: L(
    "Ihre Aufnahme ist eingegangen. Die Klinik meldet sich für das Erstgespräch; nach Therapiebeginn finden Sie hier Ihre Stundenbogen.",
    "Votre admission a bien été reçue. La clinique vous contactera pour le premier entretien ; après le début de la thérapie, vos questionnaires apparaîtront ici.",
    "Your intake has been received. The clinic will contact you to arrange your interview; after therapy begins you will find your check-ins here."),
  otherQuestionnaires: L("Weitere Fragebogen", "Autres questionnaires", "Other questionnaires"),
  otherQuestionnairesHint: L(
    "Nur ausfüllen, wenn Ihre Therapeutin / Ihr Therapeut Sie darum gebeten hat.",
    "À remplir uniquement à la demande de votre thérapeute.",
    "Only fill these out if your therapist asked you to."),
  filledOutTimes: L("{n}× ausgefüllt", "Rempli {n} fois", "Filled out {n}×"),
  fillOut: L("Ausfüllen", "Remplir", "Fill out"),
  progressOverTime: L("Ihr Therapieverlauf", "Votre évolution", "Your progress over time"),
  intakeDelivered: L("Aufnahme: übermittelt ({date}).", "Admission : transmise ({date}).", "Intake submission: delivered ({date})."),
  intakeSavedPending: L("Aufnahme: gespeichert, Übermittlung ausstehend.", "Admission : enregistrée, transmission en attente.", "Intake submission: saved, awaiting delivery."),
} as const;

export type UIKey = keyof typeof UI;

/// tr() for UI keys with {placeholder} interpolation.
export function trUI(key: UIKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s = tr(UI[key] as LangNode, lang);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/// Translated label for a disorder category slug (see DISORDER_CATEGORIES).
export function trCategory(category: string | null | undefined, lang: Lang): string {
  if (!category) return "";
  const key = (`cat${category.charAt(0).toUpperCase()}${category.slice(1)}`) as UIKey;
  return key in UI ? trUI(key, lang) : category;
}
