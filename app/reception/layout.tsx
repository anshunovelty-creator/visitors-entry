import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChartColumn, History, KeyRound, Package, LayoutGrid, LogOut, Settings, Siren, Ticket, UserPlus } from "lucide-react";
import { signOutStaff } from "./actions";
import { getStaff, initials } from "./staff";
import { ArrivalAlerts } from "./arrival-alerts";
import { HostReminders } from "./host-reminders";
import { CheckInFab, Tab } from "./tabs";

export default function ReceptionLayout({ children }: LayoutProps<"/reception">) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex items-center gap-1 border-b border-line bg-surface px-4 py-3 print:hidden lg:w-[230px] lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <Image src="/logo.png" alt="Novelty Labels" width={160} height={40} className="mr-auto h-8 w-auto self-center lg:mx-2 lg:mb-6 lg:h-10 lg:self-start" />
        <Suspense>
          <Nav />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-0 print:pb-0">{children}</div>
    </div>
  );
}

async function Nav() {
  const { me } = await getStaff();
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-line bg-surface px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:static lg:flex-col lg:border-0 lg:p-0">
        <Tab href="/reception" label={me.role === "host" ? "My visitors" : "Lobby"}><LayoutGrid className="size-5" /></Tab>
        {/* On phones the floating button below does this. */}
        {me.role !== "host" && <div className="hidden lg:contents"><Tab href="/reception/check-in" label="Check in"><UserPlus className="size-5" /></Tab></div>}
        <Tab href="/reception/invites" label="Invites"><Ticket className="size-5" /></Tab>
        <Tab href="/reception/log" label="Visit log"><History className="size-5" /></Tab>
        <Tab href="/reception/deliveries" label="Deliveries"><Package className="size-5" /></Tab>
        {me.role !== "host" && <Tab href="/reception/reports" label="Reports"><ChartColumn className="size-5" /></Tab>}
        <Tab href="/reception/roll-call" label="Roll call" danger><Siren className="size-5" /></Tab>
        {me.role === "admin" && <Tab href="/admin" label="Admin"><Settings className="size-5" /></Tab>}
      </nav>
      {me.role !== "host" && <><CheckInFab /><HostReminders /></>}
      <div className="flex items-center gap-2.5 lg:mt-auto lg:border-t lg:border-[#EEF2EF] lg:p-3">
        <span className="av hidden size-[34px] text-[13px] lg:grid">{initials(me.full_name)}</span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <b className="block truncate text-[13.5px]">{me.full_name}</b>
          <span className="block truncate text-[12.5px] capitalize text-muted">{me.role}</span>
        </span>
        <ArrivalAlerts me={me.id} />
        <Link href="/account" aria-label="Change password" className="grid size-11 place-items-center rounded-[10px] text-muted hover:bg-tint">
          <KeyRound className="size-5" />
        </Link>
        <form action={signOutStaff}>
          <button aria-label="Sign out" className="grid size-11 place-items-center rounded-[10px] text-muted hover:bg-tint">
            <LogOut className="size-5" />
          </button>
        </form>
      </div>
    </>
  );
}
