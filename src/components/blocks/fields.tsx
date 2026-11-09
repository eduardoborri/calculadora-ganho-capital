// Small form pieces shared by the blocks. Fields the user fills are pale yellow, as in the
// reference calculator; computed values stay white.

import type { ReactNode } from "react";
import CurrencyInput from "../shared/CurrencyInput";
import { cellInput } from "../shared/styles";
import Tooltip from "../shared/Tooltip";

export const fieldBox =
  "flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded focus-within:ring-2 focus-within:ring-secondary/40";

interface BlockCardProps {
  title: string;
  // Right side of the heading: the switch that opens a block that may not apply.
  control?: ReactNode;
  // A collapsed block shows only its heading and this line.
  collapsed?: boolean;
  summary?: ReactNode;
  children?: ReactNode;
}

export function BlockCard({ title, control, collapsed = false, summary, children }: BlockCardProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="section-title">{title}</h2>
        {control}
      </div>
      {collapsed ? (
        summary && <p className="text-sm text-text-gray leading-relaxed">{summary}</p>
      ) : (
        <div className="card p-5 max-sm:p-4 space-y-5">{children}</div>
      )}
    </section>
  );
}

interface FieldProps {
  label: string;
  tooltip?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, tooltip, hint, className = "", children }: FieldProps) {
  return (
    <div className={`space-y-1 min-w-0 ${className}`}>
      <span className="flex items-center text-xs font-semibold text-primary leading-snug">
        <span>{label}</span>
        <Tooltip text={tooltip} />
      </span>
      {children}
      {hint && <p className="text-xs text-text-gray leading-snug">{hint}</p>}
    </div>
  );
}

interface MoneyFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  hint?: ReactNode;
  unit?: "R$" | "%";
  className?: string;
}

export function MoneyField({ label, value, onChange, tooltip, hint, unit = "R$", className }: MoneyFieldProps) {
  return (
    <Field label={label} tooltip={tooltip} hint={hint} className={className}>
      <div className={fieldBox}>
        {unit === "R$" && <span className="text-xs text-gray-500 font-semibold">R$</span>}
        <CurrencyInput value={value} onChange={onChange} ariaLabel={label} className={`${cellInput} text-right`} />
        {unit === "%" && <span className="text-xs text-gray-500 font-semibold">%</span>}
      </div>
    </Field>
  );
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tooltip?: string;
  hint?: ReactNode;
  className?: string;
}

export function DateField({ label, value, onChange, tooltip, hint, className }: DateFieldProps) {
  return (
    <Field label={label} tooltip={tooltip} hint={hint} className={className}>
      <div className={fieldBox}>
        <input type="date" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} className={cellInput} />
      </div>
    </Field>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tooltip?: string;
  hint?: ReactNode;
  className?: string;
}

export function TextField({ label, value, onChange, placeholder, tooltip, hint, className }: TextFieldProps) {
  return (
    <Field label={label} tooltip={tooltip} hint={hint} className={className}>
      <div className={fieldBox}>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className={`${cellInput} font-medium`}
        />
      </div>
    </Field>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
}

export function CheckField({ label, checked, onChange, tooltip }: CheckFieldProps) {
  return (
    <div className="flex items-start text-sm text-ink">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-primary shrink-0"
        />
        <span className="leading-snug">{label}</span>
      </label>
      <Tooltip text={tooltip} />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="segmented flex-wrap" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  tooltip?: string;
  hint?: ReactNode;
  className?: string;
}

export function SelectField<T extends string>({ label, value, options, onChange, tooltip, hint, className }: SelectFieldProps<T>) {
  return (
    <Field label={label} tooltip={tooltip} hint={hint} className={className}>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full text-sm px-3 py-2 border border-yellow-200 rounded bg-yellow-50 text-primary font-semibold"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
