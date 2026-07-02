"use client";
import React from "react";
import { C } from "@/lib/theme";
import { tr, T, LANGS, type Lang } from "@/lib/i18n";
import type { Item } from "@/lib/dips/types";
import type { ModuleAnswers } from "@/lib/types";
import { YesNo, Sev03, Scale08, inputStyle } from "./ui";

type SetFn = (key: string, val: string | number | boolean) => void;
type Val = string | number | boolean | undefined;

export function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
      {LANGS.map((l) => (
        <button key={l.id} type="button" onClick={() => setLang(l.id)} aria-pressed={lang === l.id} className="text-xs font-semibold px-3 py-1.5"
          style={{ background: lang === l.id ? C.spruce : C.surface, color: lang === l.id ? "#fff" : C.muted }}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ChecksWithYesNo({ item, m, set, lang }: { item: Item; m: ModuleAnswers; set: SetFn; lang: Lang }) {
  return (
    <div>
      <YesNo value={m[item.id] as string | undefined} onChange={(v) => set(item.id, v)} lang={lang} />
      <div className="flex flex-col gap-2 mt-3">
        {item.checks!.map((c) => (
          <label key={c.key} className="flex items-center gap-2 text-sm" style={{ color: C.ink }}>
            <input type="checkbox" checked={!!m[`${item.id}_${c.key}`]} onChange={(e) => set(`${item.id}_${c.key}`, e.target.checked)} />
            {tr(c.label, lang)}
          </label>
        ))}
      </div>
    </div>
  );
}

function DipsGrid({ item, m, set, lang }: { item: Item; m: ModuleAnswers; set: SetFn; lang: Lang }) {
  return (
    <div>
      <p className="text-sm" style={{ color: C.ink }}>
        {item.code && <span className="font-bold mr-2" style={{ color: C.spruce }}>{item.code}</span>}
        {tr(item.q, lang)}<span style={{ color: C.amber }}> *</span>
      </p>
      {item.note && <p className="text-xs mt-1 mb-1" style={{ color: C.muted }}>{tr(item.note, lang)}</p>}
      <p className="text-xs mb-3" style={{ color: C.muted }}>{tr(T.sev03, lang)}</p>
      <div className="flex flex-col gap-3">
        {(item.groups ?? []).map((g, gi) => (
          <div key={gi}>
            {g.title && <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: C.muted }}>{tr(g.title, lang)}</p>}
            <div className="flex flex-col gap-2">
              {g.rows.map((r) => {
                const pk = `${item.id}_${r.key}_primary`;
                const primary = m[pk] as string | undefined;
                return (
                  <div key={r.key} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                    <p className="text-sm mb-2" style={{ color: C.ink }}>{tr(r.label, lang)}</p>
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <span className="text-xs block mb-1" style={{ color: C.muted }}>{tr(item.primaryLabel, lang)}</span>
                        <YesNo value={primary} onChange={(v) => set(pk, v)} lang={lang} />
                      </div>
                      {primary === "yes" &&
                        (item.cols ?? []).map((col) => {
                          const ck = `${item.id}_${r.key}_${col.key}`;
                          return (
                            <div key={col.key}>
                              <span className="text-xs block mb-1" style={{ color: C.muted }}>{tr(col.label, lang)}</span>
                              {col.kind === "yesno" ? (
                                <YesNo value={m[ck] as string | undefined} onChange={(v) => set(ck, v)} lang={lang} />
                              ) : (
                                <Sev03 value={m[ck] as number | undefined} onChange={(v) => set(ck, v)} />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DipsItem({ item, m, set, lang }: { item: Item; m: ModuleAnswers; set: SetFn; lang: Lang }) {
  const code = item.code ? <span className="font-bold mr-2" style={{ color: C.spruce }}>{item.code}</span> : null;
  const v = m[item.id] as Val;
  const q = (
    <p className="text-sm" style={{ color: C.ink }}>
      {code}{tr(item.q, lang)}{item.req ? <span style={{ color: C.amber }}> *</span> : null}
    </p>
  );

  if (item.type === "subhead") return <div className="pt-1"><p className="text-sm font-bold" style={{ color: C.spruce }}>{tr(item.q, lang)}</p></div>;
  if (item.type === "grid") return <DipsGrid item={item} m={m} set={set} lang={lang} />;
  if (item.type === "yesno")
    return (
      <div>{q}
        <div className="mt-2">{item.checks ? <ChecksWithYesNo item={item} m={m} set={set} lang={lang} /> : <YesNo value={v as string | undefined} onChange={(val) => set(item.id, val)} lang={lang} />}</div>
      </div>
    );
  if (item.type === "yesno_text")
    return (
      <div>{q}
        <div className="mt-2"><YesNo value={v as string | undefined} onChange={(val) => set(item.id, val)} lang={lang} /></div>
        <div className="mt-2">
          <span className="text-xs font-semibold" style={{ color: C.muted }}>
            {tr(item.describe || T.describe, lang)} <span style={{ fontWeight: 400 }}>({tr(T.optional, lang)})</span>
          </span>
          <textarea style={{ ...inputStyle, resize: "vertical", marginTop: 4 }} rows={2} value={(m[`${item.id}_text`] as string) || ""} onChange={(e) => set(`${item.id}_text`, e.target.value)} />
        </div>
      </div>
    );
  if (item.type === "textarea")
    return <div>{q}<textarea style={{ ...inputStyle, resize: "vertical", marginTop: 8 }} rows={2} value={(v as string) || ""} onChange={(e) => set(item.id, e.target.value)} placeholder={tr(T.optional, lang)} /></div>;
  if (item.type === "date")
    return <div>{q}<input style={{ ...inputStyle, maxWidth: 220, marginTop: 8 }} placeholder="MM/YYYY" value={(v as string) || ""} onChange={(e) => set(item.id, e.target.value)} /></div>;
  if (item.type === "monthyear_range")
    return (
      <div>{q}
        <div className="flex flex-wrap gap-3 mt-2">
          <label className="text-xs" style={{ color: C.muted }}>{tr(T.from, lang)}
            <input style={{ ...inputStyle, maxWidth: 160, marginTop: 4 }} placeholder="MM/YYYY" value={(m[`${item.id}_from`] as string) || ""} onChange={(e) => set(`${item.id}_from`, e.target.value)} />
          </label>
          <label className="text-xs" style={{ color: C.muted }}>{tr(T.to, lang)}
            <input style={{ ...inputStyle, maxWidth: 160, marginTop: 4 }} placeholder="MM/YYYY" value={(m[`${item.id}_to`] as string) || ""} onChange={(e) => set(`${item.id}_to`, e.target.value)} />
          </label>
        </div>
      </div>
    );
  if (item.type === "number_label")
    return (
      <div>{q}
        <div className="flex items-center gap-2 mt-2">
          <input type="number" min="0" style={{ ...inputStyle, maxWidth: 110 }} value={(v as string) || ""} onChange={(e) => set(item.id, e.target.value)} />
          <span className="text-xs" style={{ color: C.muted }}>{tr(item.unit, lang)}</span>
        </div>
      </div>
    );
  if (item.type === "dual_scale")
    return (
      <div>{q}
        <p className="text-xs mt-1 mb-2" style={{ color: C.muted }}>{tr(item.help, lang)}</p>
        <div className="flex flex-col gap-3">
          {(item.parts ?? []).map((pt) => (
            <div key={pt.key}>
              <p className="text-xs font-semibold mb-1" style={{ color: C.ink }}>{tr(pt.label, lang)}</p>
              <Scale08 value={m[`${item.id}_${pt.key}`] as number | undefined} onChange={(val) => set(`${item.id}_${pt.key}`, val)} />
            </div>
          ))}
        </div>
      </div>
    );
  return null;
}
