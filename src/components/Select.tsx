'use client';

/**
 * Thin wrapper over `<select>` that owns the dark-mode background fix and
 * nothing else: an explicit `bg-white … dark:bg-zinc-900` on both the
 * `<select>` and every `<option>`. Without it, a transparent select renders
 * an unreadable native option list in dark mode on some platforms — browsers
 * don't inherit the select's background into the option popup. This bug was
 * documented independently at three call sites (AiKeyPanel.tsx, ThemeToggle.tsx,
 * DayPlanner.tsx) and still missed at three more before this component
 * existed; every call site now goes through here so it can't regress again.
 *
 * Deliberately minimal: only the props the app's seven call sites actually
 * use. Border, text size, and text colour are NOT baked in here — they vary
 * per site (e.g. ThemeToggle's muted `text-zinc-600` vs the standard
 * `text-foreground`) and are supplied via `className`.
 * @packageDocumentation
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required,
  className = '',
  options,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  className?: string;
  options: SelectOption[];
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      required={required}
      className={`rounded border border-border-strong bg-white dark:bg-zinc-900 ${className}`}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className="bg-white dark:bg-zinc-900"
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}
