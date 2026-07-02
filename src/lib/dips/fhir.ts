import { tr } from "../i18n";
import type { Lang } from "../i18n";
import type { Demographics, DipsAnswers, ModuleAnswers } from "../types";
import { gridRows, isVisible } from "./engine";
import { MODULES } from "./schema";
import type { Item } from "./types";

export const DIPS_QUESTIONNAIRE_URI =
  "https://linden.clinic/fhir/Questionnaire/dips-oa-anxiety|1.0";

interface FhirAnswer {
  valueBoolean?: boolean;
  valueInteger?: number;
  valueString?: string;
}
interface FhirItem {
  linkId: string;
  text: string;
  answer?: FhirAnswer[];
  item?: FhirItem[];
}
export interface QuestionnaireResponse {
  resourceType: "QuestionnaireResponse";
  meta: { tag: { system: string; code: string }[] };
  questionnaire: string;
  status: "completed";
  subject: { reference: string; display: string };
  authored: string;
  item: FhirItem[];
}

interface FhirSubject {
  id: string;
  name: string;
  demographics: Demographics;
}
interface FhirRecord {
  answers: DipsAnswers;
  lang: Lang;
  completedAt: string;
}

function answersForItem(item: Item, m: ModuleAnswers): FhirAnswer[] {
  const v = m[item.id];
  switch (item.type) {
    case "yesno": {
      if (v == null) return [];
      const ans: FhirAnswer[] = [{ valueBoolean: v === "yes" }];
      if (item.checks)
        item.checks.forEach((c) => {
          if (m[`${item.id}_${c.key}`]) ans.push({ valueString: tr(c.label, "en") });
        });
      return ans;
    }
    case "yesno_text": {
      if (v == null) return [];
      const ans: FhirAnswer[] = [{ valueBoolean: v === "yes" }];
      const t = m[`${item.id}_text`];
      if (t) ans.push({ valueString: String(t) });
      return ans;
    }
    case "number_label":
      return v ? [{ valueInteger: Number(v) }] : [];
    case "date":
    case "textarea":
      return v ? [{ valueString: String(v) }] : [];
    case "monthyear_range": {
      const f = m[`${item.id}_from`];
      const t = m[`${item.id}_to`];
      return f || t ? [{ valueString: `${f || "?"}–${t || "?"}` }] : [];
    }
    default:
      return [];
  }
}

function fhirItemsForModuleItem(item: Item, m: ModuleAnswers): FhirItem[] {
  if (item.type === "subhead") return [];
  if (item.type === "dual_scale")
    return (item.parts ?? [])
      .filter((p) => m[`${item.id}_${p.key}`] != null)
      .map((p) => ({
        linkId: `${item.id}.${p.key}`,
        text: tr(p.label, "en"),
        answer: [{ valueInteger: Number(m[`${item.id}_${p.key}`]) }],
      }));
  if (item.type === "grid")
    return gridRows(item)
      .filter((r) => m[`${item.id}_${r.key}_primary`] != null)
      .map((r) => {
        const answer: FhirAnswer[] = [{ valueBoolean: m[`${item.id}_${r.key}_primary`] === "yes" }];
        const sub: FhirItem[] = [];
        (item.cols ?? []).forEach((c) => {
          const val = m[`${item.id}_${r.key}_${c.key}`];
          if (val != null)
            sub.push({
              linkId: `${item.id}.${r.key}.${c.key}`,
              text: tr(c.label, "en"),
              answer: [c.kind === "yesno" ? { valueBoolean: val === "yes" } : { valueInteger: Number(val) }],
            });
        });
        const node: FhirItem = { linkId: `${item.id}.${r.key}`, text: tr(r.label, "en"), answer };
        if (sub.length) node.item = sub;
        return node;
      });
  const answer = answersForItem(item, m);
  return answer.length ? [{ linkId: item.id, text: tr(item.q, "en"), answer }] : [];
}

export function toFHIR(subject: FhirSubject, record: FhirRecord): QuestionnaireResponse {
  const { answers, lang, completedAt } = record;
  const groups: FhirItem[] = MODULES.filter((mod) => mod.enter(answers[mod.id] || {})).map((mod) => {
    const m = answers[mod.id] || {};
    const children = mod.sections
      .flatMap((s) => s.items)
      .filter((it) => isVisible(it, m))
      .flatMap((it) => fhirItemsForModuleItem(it, m));
    return { linkId: mod.id, text: tr(mod.title, "en"), item: children };
  });
  const demoItem: FhirItem[] = Object.entries(subject.demographics || {})
    .filter(([, v]) => v)
    .map(([k, v]) => ({ linkId: `demographics.${k}`, text: k, answer: [{ valueString: String(v) }] }));
  return {
    resourceType: "QuestionnaireResponse",
    meta: { tag: [{ system: "urn:ietf:bcp:47", code: lang }] },
    questionnaire: DIPS_QUESTIONNAIRE_URI,
    status: "completed",
    subject: { reference: `Patient/${subject.id}`, display: subject.name },
    authored: completedAt,
    item: [{ linkId: "demographics", text: "Personal details", item: demoItem }, ...groups],
  };
}
