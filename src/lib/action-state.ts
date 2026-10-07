export type ActionState = { ok: boolean | null; message: string };
export const initialActionState: ActionState = { ok: null, message: "" };

export function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
