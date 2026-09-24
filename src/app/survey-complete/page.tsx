import type { Metadata } from "next";
import { SurveyComplete } from "@/components/SurveyComplete";

// Public — reached by patients from the LimeSurvey end-URL redirect
// (see src/app/api/limesurvey/notify/route.ts).
export const metadata: Metadata = {
  title: "Vielen Dank · Fribourg Clinic",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SurveyComplete />;
}
