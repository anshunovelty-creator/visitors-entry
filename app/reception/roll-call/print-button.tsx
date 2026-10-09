"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-sm border-[1.5px] border-line-input bg-surface print:hidden">
      <Printer className="size-4" /> Print list
    </button>
  );
}
