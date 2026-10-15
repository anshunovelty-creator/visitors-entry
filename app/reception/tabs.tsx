"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserPlus } from "lucide-react";

// Phones: a bottom tab bar (icon over label). From 1024px: the sidebar rows.
export function Tab({ href, label, danger, children }: { href: string; label: string; danger?: boolean; children: ReactNode }) {
  const path = usePathname();
  const active = href === "/reception" ? path === href : path.startsWith(href);
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[11.5px] font-medium
        lg:min-h-11 lg:flex-none lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:text-[14.5px] lg:hover:bg-tint
        ${danger ? "text-danger" : active ? "text-brand" : "text-ink-2"} ${active ? "lg:bg-tint" : ""}`}>
      {children}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

// Phones only, above the tab bar; hidden on the check-in page itself.
export function CheckInFab() {
  if (usePathname() === "/reception/check-in") return null;
  return (
    <Link href="/reception/check-in"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex h-14 items-center gap-2 rounded-full bg-brand px-5 font-display text-[17px] font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-hover lg:hidden">
      <UserPlus className="size-5" />Check in
    </Link>
  );
}
