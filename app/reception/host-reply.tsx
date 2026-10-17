import { CircleCheck, Clock, UserX } from "lucide-react";
import { hostRespond, letIn } from "./actions";

// The host's approval on a visitor row. The host themselves gets Approve / Decline; reception can let
// a visitor in when the host hasn't approved (no answer, or declined but they're seeing someone else).
export function HostReply({ visitId, response, mine, reception = false }: {
  visitId: string; response: "coming" | "unavailable" | null; mine: boolean; reception?: boolean;
}) {
  const override = reception && !mine && response !== "coming" && (
    <form action={letIn.bind(null, visitId)}><button className="btn-sm border-[1.5px] border-line-input bg-surface">Let in anyway</button></form>
  );
  if (mine && !response) {
    return (
      <span className="flex gap-1.5">
        <form action={hostRespond.bind(null, visitId, "coming")}><button className="btn-sm bg-brand text-white">Approve</button></form>
        <form action={hostRespond.bind(null, visitId, "unavailable")}><button className="btn-sm border-[1.5px] border-line-input bg-surface">Decline</button></form>
      </span>
    );
  }
  if (response === "coming") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-brand"><CircleCheck className="size-3.5" />Approved</span>;
  }
  if (response === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE4E2] px-2.5 py-0.5 text-xs font-semibold text-danger"><UserX className="size-3.5" />Host declined</span>
        {mine && <form action={hostRespond.bind(null, visitId, "coming")}><button className="min-h-11 px-1 text-xs font-semibold text-brand">Approve instead</button></form>}
        {override}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock className="size-3.5" />Waiting for host</span>
      {override}
    </span>
  );
}
