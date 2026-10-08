import { Suspense } from "react";
import type { Metadata } from "next";
import { PhoneFlow } from "./phone-flow";

export const metadata: Metadata = { title: "Check in · Novelty Labels" };

// Public: opened from the entrance poster QR, or the link in an invite email (?code=ABC234).
export default function VisitPage() {
  return (
    <Suspense>
      <PhoneFlow />
    </Suspense>
  );
}
