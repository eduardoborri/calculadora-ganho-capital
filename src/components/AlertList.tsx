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

// One panel, one row per alert, the level as a pale pill in its own column: petróleo for open
// points, coral only for risk, neutral for warnings and notes. The text stays in ink.
const LEVEL_BADGE: Record<Alert["level"], string> = {
  aberto: "bg-primary/10 text-primary",
  risco: "bg-accent/10 text-accent-ink",
  aviso: "bg-paper text-text-gray",
  info: "bg-paper text-text-gray",
};

export default function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="section-title">Alertas e pontos em aberto</h2>
        <p className="text-sm text-text-gray">
          {alerts.length} {alerts.length === 1 ? "item" : "itens"}
        </p>
      </div>
      <ul className="card divide-y divide-rule">
        {alerts.map((alert, index) => (
          <li
            key={`${alert.id}-${index}`}
            className="grid grid-cols-[8.5rem_minmax(0,1fr)] max-sm:grid-cols-1 gap-x-4 gap-y-2 px-5 py-4 max-sm:px-4"
          >
            <span className={`justify-self-start whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded ${LEVEL_BADGE[alert.level]}`}>
              {LEVEL_LABEL[alert.level]}
            </span>
            <div className="space-y-1 min-w-0">
              <p className="text-sm leading-relaxed text-ink">{alert.text}</p>
              <p className="text-xs text-text-gray">{alert.legal}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
