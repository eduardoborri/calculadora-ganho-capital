import { Ban } from "lucide-react";

interface OutOfScopeNoticeProps {
  reasons: string[];
}

// Shown in place of the memo when the case is out of scope: the reasons, and no values.
export default function OutOfScopeNotice({ reasons }: OutOfScopeNoticeProps) {
  return (
    <aside className="bg-white border border-rule border-l-[3px] border-l-accent rounded-lg p-6 space-y-4" aria-label="Caso fora do escopo">
      <h2 className="flex items-center gap-2 text-[21px] font-semibold leading-tight text-primary">
        <Ban className="w-5 h-5 text-accent shrink-0" />
        Fora do escopo da ferramenta
      </h2>
      <ul className="space-y-2 text-sm text-ink leading-relaxed list-disc pl-5">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="text-xs text-text-gray leading-relaxed">
        A calculadora não apura o imposto nesta situação e não mostra valores. O caso pede análise própria.
      </p>
    </aside>
  );
}
