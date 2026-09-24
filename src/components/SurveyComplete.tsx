"use client";
// Public thank-you page shown after a patient submits a LimeSurvey
// questionnaire: the survey's end URL pings /api/limesurvey/notify, which
// imports the response and redirects here. No session, no patient data — the
// page is identical for every outcome (see the notify route). Language follows
// the viewer's stored UI language, default German, switchable in the header.
import React from "react";
import { C } from "@/lib/theme";
import { Card, LeafMark } from "./ui";
import { LangProvider, LangSwitcher, useT } from "./LangContext";

function Content() {
  const t = useT();
  return (
    <div className="min-h-screen px-4 py-10" style={{ background: C.bg }}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <LeafMark size={40} />
            <div>
              <p className="lc-display text-3xl" style={{ color: C.ink }}>Fribourg Clinic</p>
              <p className="text-sm" style={{ color: C.muted }}>{t("appTagline")}</p>
            </div>
          </div>
          <LangSwitcher compact />
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <span aria-hidden="true" className="flex items-center justify-center rounded-full"
              style={{ width: 36, height: 36, background: C.spruceSoft, color: C.spruce, fontSize: 20, fontWeight: 700 }}>
              ✓
            </span>
            <h1 className="lc-display text-2xl" style={{ color: C.ink }}>{t("surveyDoneTitle")}</h1>
          </div>
          <p className="text-base" style={{ color: C.ink }}>{t("surveyDoneBody")}</p>
          <p className="text-sm mt-2" style={{ color: C.muted }}>{t("surveyDoneUse")}</p>

          {/* Answers are not read in real time — say so, and say where to turn. */}
          <div className="rounded-lg p-4 mt-5" style={{ background: C.blueSoft, border: `1px solid ${C.line}` }}>
            <p className="text-sm" style={{ color: C.ink }}>{t("surveyDoneCrisis")}</p>
            <ul className="text-sm mt-2 flex flex-col gap-1" style={{ color: C.ink }}>
              <li><strong>{t("crisis143")}</strong></li>
              <li>{t("crisis147")}</li>
              <li>{t("crisis144")}</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function SurveyComplete() {
  return (
    <LangProvider>
      <Content />
    </LangProvider>
  );
}
