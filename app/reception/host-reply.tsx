import { Clock, Footprints, UserX } from "lucide-react";
import { hostRespond } from "./actions";

// The host's answer on a visitor row. The host themselves gets the buttons; everyone else sees the status.
export function HostReply({ visitId, response, mine }: { visitId: string; response: "coming" | "unavailable" | null; mine: boolean }) {
  if (mine && !response) {
    return (
      <span className="flex gap-1.5">
        <form action={hostRespond.bind(null, visitId, "coming")}><button className="btn-sm bg-brand text-white">Coming down</button></form>
        <form action={hostRespond.bind(null, visitId, "unavailable")}><button className="btn-sm border-[1.5px] border-line-input bg-surface">Not available</button></form>
      </span>
    );
  }
  if (response === "coming") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-brand"><Footprints className="size-3.5" />Host coming</span>;
  }
  if (response === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE4E2] px-2.5 py-0.5 text-xs font-semibold text-danger"><UserX className="size-3.5" />Host not available</span>
        {mine && <form action={hostRespond.bind(null, visitId, "coming")}><button className="min-h-11 px-1 text-xs font-semibold text-brand">Change</button></form>}
      </span>
    );
  }
  return <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock className="size-3.5" />Waiting for host</span>;
}
