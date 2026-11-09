interface LabelFieldProps {
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}

// Editable row description. A one-row textarea that grows with its text
// (field-sizing), so long descriptions such as "Rendimentos isentos e não
// tributáveis (exceto lucros e dividendos)" wrap instead of being cut off.
// Enter is ignored: a description is one line of text.
export default function LabelField({ value, ariaLabel, onChange }: LabelFieldProps) {
  return (
    <textarea
      rows={1}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 p-0 text-primary font-medium text-sm leading-snug resize-none field-sizing-content"
    />
  );
}
