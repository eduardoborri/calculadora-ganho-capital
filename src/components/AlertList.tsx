import type { Alert } from "../types";

interface AlertListProps {
  alerts: Alert[];
}

const LEVEL_LABEL: Record<Alert["level"], string> = {
  aberto: "Ponto em aberto",
  risco: "Risco",
  aviso: "Aviso",
  info: "Informação",
};

// Coral only for risk; open points carry their own badge; warnings and notes stay neutral.
const LEVEL_STYLE: Record<Alert["level"], { border: string; badge: string }> = {
  aberto: { border: "border-l-primary", badge: "bg-primary text-white" },
  risco: { border: "border-l-accent", badge: "bg-accent/10 text-accent" },
  aviso: { border: "border-l-rule", badge: "bg-paper text-text-gray" },
  info: { border: "border-l-rule", badge: "bg-paper text-text-gray" },
};

export default function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="section-title">Alertas e pontos em aberto</h2>
      <ul className="space-y-2">
        {alerts.map((alert, index) => {
          const style = LEVEL_STYLE[alert.level];
          return (
            <li key={`${alert.id}-${index}`} className={`bg-white border border-rule border-l-[3px] ${style.border} rounded px-4 py-3 space-y-1.5`}>
              <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded ${style.badge}`}>{LEVEL_LABEL[alert.level]}</span>
              <p className={`text-sm leading-relaxed ${alert.level === "risco" ? "text-accent" : "text-ink"}`}>{alert.text}</p>
              <p className="text-xs text-text-gray">{alert.legal}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
