import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { History, LayoutGrid, LogOut, Settings, Ticket } from "lucide-react";
import { signOutStaff } from "./actions";
import { getStaff, initials } from "./staff";

export default function ReceptionLayout({ children }: LayoutProps<"/reception">) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex items-center gap-1 border-b border-line bg-surface px-4 py-3 lg:w-[230px] lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <Image src="/logo.png" alt="Novelty Labels" width={160} height={40} className="mr-auto h-8 w-auto self-center lg:mx-2 lg:mb-6 lg:h-10 lg:self-start" />
        <Suspense>
          <Nav />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

const item = "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[14.5px] font-medium text-ink-2 hover:bg-tint";

async function Nav() {
  const { me } = await getStaff();
  return (
    <>
      <nav className="flex gap-1 lg:flex-col">
        <Link href="/reception" className={item}><LayoutGrid className="size-5" /><span className="hidden sm:inline">{me.role === "host" ? "My visitors" : "Lobby"}</span></Link>
        <Link href="/reception/invites" className={item}><Ticket className="size-5" /><span className="hidden sm:inline">Invites</span></Link>
        <Link href="/reception/log" className={item}><History className="size-5" /><span className="hidden sm:inline">Visit log</span></Link>
        {me.role === "admin" && <Link href="/admin" className={item}><Settings className="size-5" /><span className="hidden sm:inline">Admin</span></Link>}
      </nav>
      <div className="flex items-center gap-2.5 lg:mt-auto lg:border-t lg:border-[#EEF2EF] lg:p-3">
        <span className="av hidden size-[34px] text-[13px] lg:grid">{initials(me.full_name)}</span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <b className="block truncate text-[13.5px]">{me.full_name}</b>
          <span className="text-[12.5px] capitalize text-muted">{me.role}</span>
        </span>
        <form action={signOutStaff}>
          <button aria-label="Sign out" className="grid size-11 place-items-center rounded-[10px] text-muted hover:bg-tint">
            <LogOut className="size-5" />
          </button>
        </form>
      </div>
    </>
  );
}
