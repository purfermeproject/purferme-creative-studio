"use client";

import { useState } from "react";

const CUSTOM = "__custom__";

/** A dropdown with a final "Write your own…" option that swaps in a text box. */
export function ChoiceOrCustom({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [custom, setCustom] = useState(() => !options.some((o) => o.value === value));

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        className="input"
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>✏️ Write your own…</option>
      </select>
      {custom ? (
        <input
          id={`${id}-custom`}
          aria-label={`${label}: write your own`}
          className="input mt-2"
          value={value}
          maxLength={150}
          autoFocus
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}
