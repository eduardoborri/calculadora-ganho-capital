import React, { useEffect, useState } from "react";

interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

const formatDisplay = (value: number) =>
  value === 0 ? "" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(value);

export default function CurrencyInput({
  value,
  onChange,
  placeholder = "0,00",
  className = "",
  ariaLabel,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(formatDisplay(value));

  // Keep the displayed text in sync when the value is changed from outside
  // this input (e.g. the simulator writing into the detailed form).
  useEffect(() => {
    setDisplayValue(formatDisplay(value));
  }, [value]);

  const handleBlur = () => {
    const numericValue = parseFloat(displayValue.replace(/\./g, "").replace(",", ".")) || 0;
    const fixedValue = parseFloat(numericValue.toFixed(2));
    onChange(fixedValue);
    setDisplayValue(formatDisplay(fixedValue));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow numbers, dots, and commas, but strip other characters (like currency symbols or spaces) to facilitate pasting
    const cleanedValue = val.replace(/[^0-9.,]/g, "");
    setDisplayValue(cleanedValue);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={displayValue}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
}
