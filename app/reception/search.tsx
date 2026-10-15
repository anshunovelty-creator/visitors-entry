"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// Filters the lobby through ?q= (the page filters server-side, so live refreshes keep it).
// "/" focuses it from anywhere on the page; Esc clears it.
export function LobbySearch({ q, placeholder }: { q: string; placeholder: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(q);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const next = value.trim();
    if (next === q) return;
    const t = setTimeout(() => router.replace(next ? `/reception?q=${encodeURIComponent(next)}` : "/reception", { scroll: false }), 200);
    return () => clearTimeout(t);
  }, [value, q, router]);

  return (
    <label className="relative block lg:max-w-3xl">
      <span className="sr-only">Search the lobby</span>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
      <input ref={input} type="search" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setValue(""); input.current?.blur(); } }}
        className="input pr-12 pl-11" placeholder={placeholder} maxLength={100} />
      <kbd className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-muted lg:block">/</kbd>
    </label>
  );
}
