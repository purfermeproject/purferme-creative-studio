"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAIN = [
  { href: "/create", label: "Create ads" },
  { href: "/library", label: "Saved ads" },
  { href: "/results", label: "Results" },
];

const TOOLS = [
  { href: "/check", label: "Claim checker", hint: "Check any text for risky words" },
  { href: "/guide", label: "Platform guide", hint: "How Meta, Amazon and Flipkart differ" },
  { href: "/admin", label: "Settings", hint: "Products, claims, rules" },
  { href: "/admin/usage", label: "Usage and cost", hint: "AI spend so far" },
];

const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toolActive = TOOLS.some((t) => isActive(pathname, t.href));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkCls = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
      active ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
    }`;

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {MAIN.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={linkCls(active)}>
            {l.label}
          </Link>
        );
      })}
      <div ref={ref} className="relative">
        <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} className={linkCls(toolActive)}>
          Tools <span aria-hidden>▾</span>
        </button>
        {open ? (
          <ul className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg sm:left-0">
            {TOOLS.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(pathname, t.href) ? "page" : undefined}
                  className="block rounded-lg px-3 py-2 hover:bg-surface-2"
                >
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-ink-soft">{t.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </nav>
  );
}
