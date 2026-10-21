"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAIN = [
  { href: "/create", label: "Create" },
  { href: "/research", label: "Research" },
  { href: "/library", label: "Library" },
  { href: "/competitors", label: "Competitors" },
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
  // Where the menu opens. It is fixed to the window: the nav strip scrolls sideways on phones,
  // and a menu inside it would be clipped (it opened invisibly).
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const toolActive = TOOLS.some((t) => isActive(pathname, t.href));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close);
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
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => {
            const r = button.current?.getBoundingClientRect();
            if (r) setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 264)) });
            setOpen((o) => !o);
          }}
          className={linkCls(toolActive)}
        >
          Tools <span aria-hidden>▾</span>
        </button>
        {open && at ? (
          <ul className="fixed z-50 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg" style={{ top: at.top, left: at.left }} data-testid="tools-menu">
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
