"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CreativeSnapshot } from "@/db/schema";
import type { CreativeStatus } from "@/lib/types";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "invalid";
export type SaveResponse = { revision: number; status: CreativeStatus; claimsReviewedBy: string; reviewCleared: boolean; demoted: boolean; changed: string[] };
type Conflict = { revision: number; snapshot: CreativeSnapshot };

/**
 * Debounced autosave with retry, conflict detection and a last-chance save
 * (keepalive) when the tab is hidden or closed.
 */
export function useAutosave(opts: {
  id: string | null;
  revision: number;
  snapshot: CreativeSnapshot | null;
  onSaved?: (r: SaveResponse) => void;
  delay?: number;
}) {
  const { id, snapshot, delay = 1200 } = opts;
  const [revision, setRevision] = useState(opts.revision);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const savedJson = useRef(JSON.stringify(snapshot));
  const latest = useRef(snapshot);
  const rev = useRef(opts.revision);
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const onSaved = useRef(opts.onSaved);
  const blocked = useRef(false);

  useEffect(() => {
    latest.current = snapshot;
    onSaved.current = opts.onSaved;
  });

  const impl = useRef<(keepalive?: boolean) => Promise<boolean>>(async () => true);
  const save = useCallback((keepalive = false) => impl.current(keepalive), []);

  useEffect(() => {
    impl.current = async (keepalive = false): Promise<boolean> => {
      if (!id || !latest.current || blocked.current) return !blocked.current;
      const json = JSON.stringify(latest.current);
      if (json === savedJson.current) {
        setState("saved");
        return true;
      }
      if (inflight.current) {
        await inflight.current;
        return save(keepalive);
      }
      setState("saving");
      const run = (async () => {
        try {
          const res = await fetch(`/api/creatives/${id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ baseRevision: rev.current, snapshot: JSON.parse(json) }),
            keepalive,
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            blocked.current = true;
            setConflict(data.current);
            setError(data.error ?? "Changed elsewhere.");
            setState("conflict");
            return false;
          }
          if (res.status >= 400 && res.status < 500) {
            setError(data.error ?? "This edit can't be saved.");
            setState("invalid");
            return false;
          }
          if (!res.ok) throw new Error(data.error ?? `The server returned ${res.status}.`);
          rev.current = data.revision;
          setRevision(data.revision);
          savedJson.current = json;
          attempts.current = 0;
          setSavedAt(new Date());
          setError("");
          setState(JSON.stringify(latest.current) === json ? "saved" : "dirty");
          onSaved.current?.(data);
          return true;
        } catch (e) {
          attempts.current += 1;
          setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "You seem to be offline.");
          setState("error");
          const wait = Math.min(30_000, 2000 * 2 ** (attempts.current - 1));
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), wait);
          return false;
        }
      })();
      inflight.current = run;
      const ok = await run;
      inflight.current = null;
      if (ok && latest.current && JSON.stringify(latest.current) !== savedJson.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), delay);
      }
      return ok;
    };
  }, [id, delay, save]);

  // Schedule a save whenever the content changes.
  useEffect(() => {
    if (!id || !snapshot || blocked.current) return;
    if (JSON.stringify(snapshot) === savedJson.current) return;
    setState((s) => (s === "saving" ? s : "dirty"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, snapshot, delay, save]);

  // Last-chance save when the tab is hidden or closed.
  useEffect(() => {
    const flushHidden = () => {
      if (document.visibilityState === "hidden" && latest.current && JSON.stringify(latest.current) !== savedJson.current) void save(true);
    };
    const onPageHide = () => {
      if (latest.current && JSON.stringify(latest.current) !== savedJson.current) void save(true);
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current && JSON.stringify(latest.current) !== savedJson.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", flushHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", flushHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", warn);
    };
  }, [save]);

  /** Save now (before approving, reviewing or leaving). */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    return save();
  }, [save]);

  /** Start tracking new content (loaded, restored or regenerated on the server). */
  const reset = useCallback((s: CreativeSnapshot, r: number) => {
    if (timer.current) clearTimeout(timer.current);
    savedJson.current = JSON.stringify(s);
    latest.current = s;
    rev.current = r;
    blocked.current = false;
    attempts.current = 0;
    setRevision(r);
    setConflict(null);
    setError("");
    setState("saved");
  }, []);

  /** "theirs" returns their content to show; "mine" overwrites (their version stays in history). */
  const resolveConflict = useCallback(
    (choice: "theirs" | "mine"): CreativeSnapshot | null => {
      if (!conflict) return null;
      if (choice === "theirs") {
        reset(conflict.snapshot, conflict.revision);
        return conflict.snapshot;
      }
      rev.current = conflict.revision;
      setRevision(conflict.revision);
      blocked.current = false;
      setConflict(null);
      void save();
      return null;
    },
    [conflict, reset, save],
  );

  return { state, error, savedAt, revision, conflict, flush, reset, resolveConflict, retry: () => void save() };
}
