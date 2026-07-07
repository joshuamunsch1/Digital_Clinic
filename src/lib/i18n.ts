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
  monthYearPlaceholder: L("MM/JJJJ", "MM/AAAA", "MM/YYYY"),
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
  statusArchived: L("Archiviert", "Archivé·e", "Archived"),
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
  conductedBy: L("Durchgeführt von", "Réalisé par", "Conducted by"),
  conductedByUnset: L("— keine Angabe —", "— non précisé —", "— unspecified —"),
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

  // archive (concluded treatments)
  archiveTitle: L("Patientenarchiv", "Archives des patient·e·s", "Patient archive"),
  archiveSub: L(
    "Abgeschlossene Behandlungen, geordnet nach Störungsbild und Jahr des Abschlusses. Klicken Sie auf eine Patient*in für das vollständige Dossier.",
    "Traitements terminés, classés par trouble et année de clôture. Cliquez sur un·e patient·e pour ouvrir le dossier complet.",
    "Concluded treatments, ordered by disorder category and year of conclusion. Click a patient to open the full record."),
  archiveLink: L("Archiv abgeschlossener Behandlungen ({n})", "Archives des traitements terminés ({n})", "Archive of concluded treatments ({n})"),
  archiveEmpty: L("Noch keine archivierten Behandlungen.", "Aucun traitement archivé pour le moment.", "No archived treatments yet."),
  concludeTitle: L("Behandlung abschließen & archivieren", "Clôturer le traitement et archiver", "Conclude treatment & archive"),
  concludeSub: L(
    "Verschiebt die Patient*in aus den aktiven Übersichten ins Archiv. Die kodierte Abschlussart ist erforderlich — sie ist das Behandlungsende-Label für spätere Verlaufs- und Abbruchanalysen (klinische Einschätzung der Therapeut*in).",
    "Déplace le·la patient·e des vues actives vers les archives. Le motif de clôture codé est obligatoire — c'est l'étiquette de fin de traitement pour les analyses ultérieures (jugement clinique du·de la thérapeute).",
    "Moves the patient from the active overviews into the archive. The coded termination reason is required — it is the treatment-end label for later outcome and dropout analyses (therapist judgment)."),
  terminationLabel: L("Abschlussart", "Motif de clôture", "Termination reason"),
  terminationNone: L("— bitte wählen —", "— veuillez choisir —", "— please choose —"),
  termCompleted: L("Regulär abgeschlossen", "Terminé régulièrement", "Completed as planned"),
  termDropout: L("Abbruch (einseitig durch Patient*in)", "Interruption (unilatérale, patient·e)", "Dropout (unilateral, patient)"),
  termMutual: L("Einvernehmlich beendet", "Terminé d'un commun accord", "Ended by mutual agreement"),
  termTransfer: L("Überweisung / Weiterverweisung", "Transfert / réorientation", "Transfer / referral"),
  termOther: L("Sonstiges", "Autre", "Other"),
  archiveConfirm: L("Archivieren bestätigen", "Confirmer l'archivage", "Confirm archiving"),
  archivedOn: L("Behandlung abgeschlossen und archiviert am {date}", "Traitement clôturé et archivé le {date}", "Treatment concluded and archived on {date}"),
  archivedByLine: L("durch {name}", "par {name}", "by {name}"),
  reopenTreatment: L("Behandlung wieder öffnen", "Rouvrir le traitement", "Reopen treatment"),
  archiveExportFailed: L(
    "Archiviert — aber der Dateiexport ist fehlgeschlagen: {error}",
    "Archivé — mais l'export de fichiers a échoué : {error}",
    "Archived — but the file export failed: {error}"),

  // outcome prediction (docs/outcome-prediction.md — Lutz decision support)
  predictionTitle: L("Verlaufsprognose (Entscheidungshilfe)", "Prédiction d'évolution (aide à la décision)", "Outcome prediction (decision support)"),
  predictionSub: L(
    "Therapeutenseitige Entscheidungsunterstützung nach Lutz: erwarteter Verlauf aus abgeschlossenen Behandlungen, Frühverlaufs-Klassifikation, Abbruchrisiko. Keine Diagnose, niemals patientensichtbar.",
    "Aide à la décision pour thérapeutes selon Lutz : évolution attendue à partir des traitements terminés, classification du début de traitement, risque d'interruption. Pas un diagnostic, jamais visible pour les patient·e·s.",
    "Therapist-facing decision support after Lutz: expected course from completed treatments, early-change classification, dropout risk. Not a diagnosis, never patient-facing."),
  expectedCourseLabel: L("Erwarteter Verlauf:", "Évolution attendue :", "Expected course:"),
  sourceClinic: L("Klinik-Perzentile", "Percentiles clinique", "Clinic percentiles"),
  sourceNn: L("Ähnliche Fälle (NN)", "Cas similaires (NN)", "Similar cases (NN)"),
  sourceEtr: L("ETR-Kurve (Näherung)", "Courbe ETR (approximation)", "ETR curve (approximation)"),
  etrCaveat: L("Zweistufige OLS-Näherung — kein validiertes ETR.", "Approximation OLS en deux étapes — pas un ETR validé.", "Two-stage OLS approximation — not a validated ETR."),
  etrUnavailable: L("ETR-Modell nicht verfügbar (zu wenige Referenzfälle).", "Modèle ETR indisponible (trop peu de cas de référence).", "ETR model unavailable (too few reference cases)."),
  nnUnavailable: L("Zu wenige vergleichbare abgeschlossene Fälle.", "Trop peu de cas terminés comparables.", "Too few comparable completed cases."),
  referenceN: L("Referenz: n={n} abgeschlossene Fälle", "Référence : n={n} cas terminés", "Reference: n={n} completed cases"),
  bandLabelClinic: L("Erwartungsband p25–p75, n={n} Klinik-Fälle — kein validiertes ETR", "Bande attendue p25–p75, n={n} cas de la clinique — pas un ETR validé", "Expected band p25–p75, n={n} clinic cases — not a validated ETR"),
  bandStratified: L("nach Ausgangsschwere stratifiziert", "stratifié par sévérité initiale", "stratified by initial severity"),
  bandLabelNn: L("Erwartungsband der k={k} ähnlichsten Fälle (dynamisch)", "Bande des k={k} cas les plus similaires (dynamique)", "Band of the k={k} most similar cases (dynamic)"),
  bandMedian: L("Median (Referenz)", "Médiane (référence)", "Median (reference)"),
  failureBoundary: L("Signalgrenze", "Limite d'alerte", "Failure boundary"),
  etrCurve: L("ETR (Näherung)", "ETR (approximation)", "ETR (approximation)"),
  suddenShiftLegend: L("plötzliche Verbesserung/Verschlechterung (Tang & DeRubeis)", "gain/perte soudain·e (Tang & DeRubeis)", "sudden gain/loss (Tang & DeRubeis)"),
  simulatedReference: L("Simulierte Referenzdaten", "Données de référence simulées", "Simulated reference data"),
  earlyResponse: L("Frühe Response", "Réponse précoce", "Early response"),
  earlyDeterioration: L("Frühe Verschlechterung", "Détérioration précoce", "Early deterioration"),
  earlyIndeterminate: L("Frühverlauf unbestimmt", "Début indéterminé", "Early course indeterminate"),
  onTrack: L("Im erwarteten Verlauf", "Dans l'évolution attendue", "On track"),
  notOnTrack: L("Nicht im erwarteten Verlauf", "Hors de l'évolution attendue", "Not on track"),
  insufficientReference: L("zu wenig Daten", "données insuffisantes", "insufficient data"),
  suddenGain: L("plötzliche Verbesserung", "gain soudain", "sudden gain"),
  suddenLoss: L("plötzliche Verschlechterung", "perte soudaine", "sudden loss"),
  notOnTrackBanner: L("Nicht im erwarteten Verlauf (Entscheidungshilfe)", "Hors de l'évolution attendue (aide à la décision)", "Not on track (decision support)"),
  notReasonBand: L("≥2 Messungen auf der ungünstigen Seite des Erwartungsbands", "≥2 mesures du côté défavorable de la bande attendue", "≥2 measurements on the unfavourable side of the expected band"),
  notReasonRci: L("reliable Verschlechterung gegenüber Baseline (RCI)", "détérioration fiable par rapport à la baseline (RCI)", "reliable deterioration vs baseline (RCI)"),
  notOnTrackHint: L(
    "Empfehlung der Feedback-Literatur: Problembereiche aktiv prüfen (Risiko, Motivation, Beziehung, soziales Umfeld, Emotionsregulation). Kein Alarm — ein Gesprächsanlass.",
    "Recommandation de la littérature feedback : examiner activement les domaines problématiques (risque, motivation, alliance, entourage, régulation émotionnelle). Pas une alarme — une amorce d'échange.",
    "Feedback-literature recommendation: actively review problem areas (risk, motivation, alliance, social support, emotion regulation). Not an alarm — a conversation starter."),
  dropoutTitle: L("Abbruchrisiko (Modell)", "Risque d'interruption (modèle)", "Dropout risk (model)"),
  dropoutMeta: L("Modell aus n={n} abgeschlossenen Behandlungen · Basisrate {base} % · AUC {auc}", "Modèle basé sur n={n} traitements terminés · taux de base {base} % · AUC {auc}", "Model from n={n} completed treatments · base rate {base}% · AUC {auc}"),
  dropoutFactors: L("Wichtigste Faktoren", "Facteurs principaux", "Top factors"),
  dropoutUnavailable: L("Noch kein Modell — zu wenige gelabelte abgeschlossene Behandlungen.", "Pas encore de modèle — trop peu de traitements terminés étiquetés.", "No model yet — too few labeled completed treatments."),
  nnTitle: L("Ähnlichste abgeschlossene Fälle", "Cas terminés les plus similaires", "Most similar completed cases"),
  nnMeta: L("k={k} Nachbarn · Median {sessions} Sitzungen", "k={k} voisins · médiane {sessions} séances", "k={k} neighbors · median {sessions} sessions"),
  nnCodes: L("Codes", "Codes", "Codes"),
  featAge: L("Alter", "âge", "age"),
  featBaseline: L("Ausgangsschwere", "sévérité initiale", "baseline severity"),
  featExpectation: L("Behandlungserwartung", "attentes", "treatment expectation"),
  featDuration: L("Problemdauer", "durée du problème", "problem duration"),
  featPriorTx: L("frühere Psychotherapie", "psychothérapie antérieure", "prior psychotherapy"),
  featMedication: L("Psychopharmaka", "psychotropes", "psychotropic medication"),
  featSexMale: L("Geschlecht (männlich)", "sexe (masculin)", "sex (male)"),
  featEarlyResponse: L("frühe Response", "réponse précoce", "early response"),
  featEarlyDeterioration: L("frühe Verschlechterung", "détérioration précoce", "early deterioration"),
  simChipTitle: L("Simulierte Patient*in (Referenzkohorte) — via npm run sim:purge entfernbar", "Patient·e simulé·e (cohorte de référence) — supprimable via npm run sim:purge", "Simulated patient (reference cohort) — removable via npm run sim:purge"),
  exportTitle: L("Forschungsexport (pseudonymisiert)", "Export recherche (pseudonymisé)", "Research export (pseudonymized)"),
  exportSub: L(
    "Long-Format-CSV nach dem Exportvertrag in docs/outcome-prediction.md §5 — Übergabepunkt an R/lme4/brms und Forschungskooperationen. Keine Namen, keine E-Mail-Adressen; Patient*innen erscheinen als Forschungscode, Mitarbeitende als T-Pseudonym.",
    "CSV long format selon le contrat d'export (docs/outcome-prediction.md §5) — point de transfert vers R/lme4/brms et les coopérations de recherche. Ni noms ni e-mails ; patient·e·s en code de recherche, personnel en pseudonyme T.",
    "Long-format CSV per the export contract in docs/outcome-prediction.md §5 — the handover point to R/lme4/brms and research cooperations. No names, no e-mails; patients appear as research codes, staff as T-pseudonyms."),
  exportScores: L("Skalenwerte (CSV)", "Scores d'échelles (CSV)", "Scale scores (CSV)"),
  exportItems: L("Item-Ebene (CSV)", "Niveau item (CSV)", "Item level (CSV)"),
  exportSimNote: L("Simulierte Fälle sind standardmäßig ausgeschlossen (?includeSimulated=1 nimmt sie auf).", "Les cas simulés sont exclus par défaut (?includeSimulated=1 les inclut).", "Simulated cases are excluded by default (?includeSimulated=1 opts them in)."),

  // intake predictors (docs/outcome-prediction.md §4.3 — coded ETR set)
  predictorsTitle: L("Prognosemerkmale (Aufnahme)", "Facteurs pronostiques (admission)", "Intake predictors"),
  predictorsSub: L(
    "Kodierte Merkmale für Verlaufsprognosen (Lutz-Ansatz): Problemdauer, Vorbehandlung, Medikation, Beschäftigung, Behandlungserwartung. Nur kodierte Felder, kein Freitext.",
    "Caractéristiques codées pour les prédictions d'évolution (approche Lutz) : durée du problème, traitement antérieur, médication, emploi, attentes. Champs codés uniquement, pas de texte libre.",
    "Coded characteristics for expected-course prediction (Lutz approach): problem duration, prior treatment, medication, employment, treatment expectation. Coded fields only, no free text."),
  durationLabel: L("Problemdauer", "Durée du problème", "Problem duration"),
  durLt6m: L("unter 6 Monate", "moins de 6 mois", "under 6 months"),
  durM6to24: L("6–24 Monate", "6–24 mois", "6–24 months"),
  durGt24m: L("über 24 Monate", "plus de 24 mois", "over 24 months"),
  priorTxLabel: L("Frühere Psychotherapie", "Psychothérapie antérieure", "Prior psychotherapy"),
  medicationLabel: L("Psychopharmaka", "Psychotropes", "Psychotropic medication"),
  employmentLabel: L("Beschäftigungsstatus", "Statut professionnel", "Employment status"),
  empEmployed: L("erwerbstätig", "en emploi", "employed"),
  empInTraining: L("in Ausbildung/Studium", "en formation/études", "in training/studies"),
  empUnemployed: L("erwerbslos", "sans emploi", "unemployed"),
  empRetired: L("pensioniert", "retraité·e", "retired"),
  empOther: L("anderes", "autre", "other"),
  expectationLabel: L("Behandlungserwartung (0–10)", "Attentes envers le traitement (0–10)", "Treatment expectation (0–10)"),
  predYes: L("ja", "oui", "yes"),
  predNo: L("nein", "non", "no"),
  notRecorded: L("— nicht erfasst —", "— non renseigné —", "— not recorded —"),
  savePredictors: L("Prognosemerkmale speichern", "Enregistrer les facteurs", "Save intake predictors"),
  predictorsSaved: L("Gespeichert.", "Enregistré.", "Saved."),
  icdLabel: L("ICD-10-Code (optional)", "Code CIM-10 (facultatif)", "ICD-10 code (optional)"),
  patientCodeLabel: L("Forschungscode", "Code de recherche", "Research code"),

  // session log (sessions without questionnaires, §4.5)
  sessionLogTitle: L("Sitzung ohne Fragebogen erfassen", "Consigner une séance sans questionnaire", "Log a session without questionnaire"),
  sessionLogSub: L(
    "Für Dosis-Wirkungs- und Abbruchanalysen zählen auch Sitzungen ohne Messung — sowie Absagen und Nichterscheinen.",
    "Pour les analyses dose-effet et d'interruption, les séances sans mesure comptent aussi — de même que les annulations et absences.",
    "Dose–response and dropout analyses also need sessions without measurement — plus cancellations and no-shows."),
  logTypeHeld: L("stattgefunden (ohne Fragebogen)", "a eu lieu (sans questionnaire)", "held (no questionnaire)"),
  logTypeCancelled: L("abgesagt", "annulée", "cancelled"),
  logTypeNoShow: L("nicht erschienen", "absence non annoncée", "no-show"),
  logTypeLabel: L("Art", "Type", "Type"),
  logDateLabel: L("Datum", "Date", "Date"),
  logNoteLabel: L("Notiz (optional)", "Note (facultatif)", "Note (optional)"),
  logSave: L("Eintrag speichern", "Enregistrer l'entrée", "Save entry"),
  logSaved: L("Erfasst.", "Consigné.", "Logged."),
  logDelete: L("Löschen", "Supprimer", "Delete"),
  logEntries: L("Einträge", "Entrées", "Entries"),

  // manual registration (director/admin)
  moreDetails: L("E-Mail & persönliche Angaben", "E-mail et informations personnelles", "E-mail & personal details"),
  invalidEmail: L("Bitte geben Sie eine gültige E-Mail-Adresse ein.", "Veuillez saisir une adresse e-mail valide.", "Please enter a valid e-mail address."),
  patientRegistered: L("Patient*in registriert.", "Patient·e enregistré·e.", "Patient registered."),

  // DIPS summary (clinician view)
  dipsCompletedMeta: L("Ausgefüllt am {date} · Sprache: {lang}", "Rempli le {date} · langue : {lang}", "Completed {date} · language: {lang}"),
  langNameDe: L("Deutsch", "allemand", "German"),
  langNameFr: L("Französisch", "français", "French"),
  langNameEn: L("Englisch", "anglais", "English"),
  dipsRelayed: L("Weitergeleitet · HTTP {status}", "Transmis · HTTP {status}", "Relayed · HTTP {status}"),
  dipsStoredDb: L("In Klinikdatenbank gespeichert", "Enregistré dans la base de la clinique", "Stored in clinic DB"),
  dipsSendingShort: L("Wird gesendet…", "Envoi en cours…", "Sending…"),
  dipsRelayFailed: L("Gespeichert; Weiterleitung fehlgeschlagen", "Enregistré ; transmission échouée", "Stored; relay failed"),
  dipsDisclaimer: L(
    "Zusammenfassung des Selbstbericht-Screenings — eine klinische Hilfe, keine Diagnose. Die Diagnose wird nach dem Erstgespräch von der Klinikerin / dem Kliniker erfasst.",
    "Résumé du dépistage en auto-évaluation — une aide clinique, pas un diagnostic. Le diagnostic est établi par le·la clinicien·ne après l'entretien initial.",
    "Self-report screening summary — a clinical aid, not a diagnosis. The diagnosis is recorded by the clinician after the intake interview."),
  dipsNonePositive: L(
    "Kein Angst-Modul wurde positiv gescreent. Die Patient*in hat die Screening-Fragen beantwortet; kein Bereich erreichte die Schwelle für weitere Fragen.",
    "Aucun module d'anxiété n'a été dépisté positif. Le·la patient·e a répondu aux questions de dépistage ; aucun domaine n'a atteint le seuil de poursuite.",
    "No anxiety module screened positive. The patient answered the screening questions; none met the threshold to continue."),
  screenedPositiveBadge: L("positiv gescreent", "dépistage positif", "screened positive"),
  screenedPositiveList: L("Positiv gescreent:", "Dépistage positif :", "Screened positive:"),
  endorsedOf: L("{n} von {total} bejaht", "{n} sur {total} confirmés", "{n} of {total} endorsed"),
  noneEndorsed: L("keine bejaht", "aucun confirmé", "none endorsed"),
  impairDistress: L("Beeinträchtigung / Belastung (0–8)", "Altération / détresse (0–8)", "Impairment / distress (0–8)"),
  showAllResponses: L("Alle Antworten anzeigen", "Afficher toutes les réponses", "Show all responses"),

  // misc clinician strings
  definitionBadgeTitle: L(
    "Item-/Skalendetails wurden aus dem Altsystem nicht vollständig verifiziert — siehe docs/instrument-catalog.json.",
    "Les détails des items/échelles n'ont pas été entièrement vérifiés depuis l'ancien système — voir docs/instrument-catalog.json.",
    "Item/scale detail was not fully verified from the legacy system — see docs/instrument-catalog.json."),
  scalesNotComputed: L(
    "Gespeichert — einige Skalen konnten jedoch nicht berechnet werden:",
    "Enregistré — mais certaines échelles n'ont pas pu être calculées :",
    "Saved, but some scales were not computed:"),
  importOk: L("OK", "OK", "OK"),
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

// --- Slug translations for data-model vocabulary shown in the UI ----------------
// These are stored as stable English slugs in the database; the UI translates
// them on display. Unknown slugs fall back to the slug with "_" → " ".

const slugTr = (dict: Record<string, LangNode>) => (slug: string | null | undefined, lang: Lang): string => {
  if (!slug) return "";
  const node = dict[slug];
  return node ? tr(node, lang) : slug.replace(/_/g, " ");
};

/// Rater / respondent roles (ResponseInstance.respondentRole, Instrument.raterRole).
export const trRaterRole = slugTr({
  self: L("Selbstbericht", "auto-évaluation", "self-report"),
  mother: L("Mutter", "mère", "mother"),
  father: L("Vater", "père", "father"),
  parent: L("Elternteil", "parent", "parent"),
  teacher: L("Lehrperson", "enseignant·e", "teacher"),
  caregiver: L("Bezugsperson", "proche aidant·e", "caregiver"),
  clinician: L("Kliniker*in", "clinicien·ne", "clinician"),
});

/// Instrument cadence types.
export const trCadence = slugTr({
  every_session: L("pro Sitzung", "à chaque séance", "every session"),
  wave: L("Messzeitpunkte", "temps de mesure", "measurement waves"),
  periodic: L("wiederkehrend", "périodique", "periodic"),
  intake_once: L("einmalig bei Aufnahme", "une fois à l'admission", "once at intake"),
});

/// Instrument target populations (docs/instrument-catalog.json vocabulary).
export const trPopulation = slugTr({
  adult: L("Erwachsene", "adultes", "adults"),
  adolescent: L("Jugendliche", "adolescent·e·s", "adolescents"),
  adolescent_11_17: L("Jugendliche 11–17", "adolescent·e·s 11–17", "adolescents 11–17"),
  adult_adolescent: L("Erwachsene & Jugendliche", "adultes et adolescent·e·s", "adults & adolescents"),
  child: L("Kinder", "enfants", "children"),
  child_2_4: L("Kinder 2–4", "enfants 2–4", "children 2–4"),
  child_adolescent: L("Kinder & Jugendliche", "enfants et adolescent·e·s", "children & adolescents"),
  child_adolescent_4_17: L("Kinder & Jugendliche 4–17", "enfants et adolescent·e·s 4–17", "children & adolescents 4–17"),
  child_adolescent_8_16: L("Kinder & Jugendliche 8–16", "enfants et adolescent·e·s 8–16", "children & adolescents 8–16"),
  child_school_age: L("Kinder im Schulalter", "enfants d'âge scolaire", "school-age children"),
  all: L("alle Altersgruppen", "tous âges", "all ages"),
});

/// Response sources (ResponseInstance.source).
export const trSource = slugTr({
  in_app: L("in der App", "dans l'application", "in-app"),
  limesurvey: L("LimeSurvey", "LimeSurvey", "LimeSurvey"),
  csv_import: L("CSV-Import", "import CSV", "CSV import"),
  manual_entry: L("manuelle Eingabe", "saisie manuelle", "manual entry"),
  seed: L("Demodaten", "données de démo", "demo data"),
});

/// Coded termination reasons (Patient.terminationReason — therapist judgment).
export const trTerminationReason = slugTr({
  completed: UI.termCompleted,
  dropout: UI.termDropout,
  mutual: UI.termMutual,
  transfer: UI.termTransfer,
  other: UI.termOther,
});

/// Coded problem-duration / chronicity values (CaseCharacteristics.problemDuration).
export const trProblemDuration = slugTr({
  lt6m: UI.durLt6m,
  m6to24: UI.durM6to24,
  gt24m: UI.durGt24m,
});

/// Coded employment statuses (CaseCharacteristics.employment).
export const trEmployment = slugTr({
  employed: UI.empEmployed,
  in_training: UI.empInTraining,
  unemployed: UI.empUnemployed,
  retired: UI.empRetired,
  other: UI.empOther,
});

/// Session-log entry types (SessionLog.type).
export const trSessionLogType = slugTr({
  held: UI.logTypeHeld,
  cancelled: UI.logTypeCancelled,
  no_show: UI.logTypeNoShow,
});

/// LimeSurvey invitation statuses (QuestionnaireInvitation.status).
export const trInvitationStatus = slugTr({
  created: L("erstellt", "créée", "created"),
  invited: L("eingeladen", "invitation envoyée", "invited"),
  reminded: L("erinnert", "rappel envoyé", "reminded"),
  completed: L("abgeschlossen", "terminée", "completed"),
  error: L("Fehler", "erreur", "error"),
});

/// Canonical demographics values stored by the registration forms (sex/living
/// options are stored as their English label — see Login.tsx). Free-text
/// values (occupation, city, …) pass through unchanged.
export const trDemoValue = slugTr({
  Female: L("Weiblich", "Féminin", "Female"),
  Male: L("Männlich", "Masculin", "Male"),
  "Non-binary": L("Divers", "Non-binaire", "Non-binary"),
  "Prefer not to say": L("Keine Angabe", "Préfère ne pas répondre", "Prefer not to say"),
  Alone: L("Allein", "Seul(e)", "Alone"),
  "With partner": L("Mit Partner*in", "Avec partenaire", "With partner"),
  "With family": L("Mit Familie", "Avec la famille", "With family"),
  "Shared flat": L("Wohngemeinschaft", "Colocation", "Shared flat"),
  Other: L("Andere", "Autre", "Other"),
});
