"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";

export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className = "",
  confirm,
  submitClassName = "btn-primary",
  testId,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  confirm?: string;
  submitClassName?: string;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  // Clear the form only after a successful save; failed saves keep what was typed.
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form
      ref={ref}
      className={className}
      data-testid={testId}
      onSubmit={(e) => {
        // Submit manually: a form `action` resets every field afterwards, which would wipe what
        // someone typed whenever the save fails validation.
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <p role="status" aria-live="polite" className={`text-sm ${state.ok === false ? "text-red" : "text-leaf"}`}>
          {state.message}
        </p>
      </div>
    </form>
  );
}
