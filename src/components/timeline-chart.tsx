"use client";
import { useState } from "react";

type Point = { key: string; label: string; value: number };

/** Topo do eixo em número redondo (1, 2, 5 × 10ⁿ), para as linhas de grade caírem em valores legíveis. */
function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((step) => step * magnitude >= value) ?? 10) * magnitude;
}

/** Barras de uma única série (solicitações abertas por grupo de tempo), com dica ao passar o mouse ou focar pelo teclado. */
export function TimelineChart({ points, unitLabel }: { points: Point[]; unitLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...points.map((point) => point.value)));
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const current = active === null ? null : points[active];
  return (
    <figure className="timeline-chart">
      <div className="timeline-chart-area">
        <div className="timeline-chart-axis" aria-hidden="true">
          <span>{max}</span>
          <span>{max / 2}</span>
          <span>0</span>
        </div>
        <div className="timeline-chart-plot" onMouseLeave={() => setActive(null)}>
          <div className="timeline-chart-grid" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="timeline-chart-bars" role="list" aria-label={`Solicitações abertas por ${unitLabel}`}>
            {points.map((point, index) => (
              <button
                type="button"
                role="listitem"
                key={point.key}
                className={`timeline-chart-bar ${active === index ? "active" : ""}`}
                aria-label={`${point.label}: ${point.value} ${point.value === 1 ? "solicitação" : "solicitações"}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              >
                <span style={{ height: `${(point.value / max) * 100}%` }} />
              </button>
            ))}
          </div>
          {current && (
            <div className="timeline-chart-tooltip" style={{ left: `${((active! + 0.5) / points.length) * 100}%` }} role="status">
              <strong>{current.value}</strong> {current.value === 1 ? "solicitação" : "solicitações"}
              <small>{current.label}</small>
            </div>
          )}
        </div>
        <span aria-hidden="true" />
        <div className="timeline-chart-labels" aria-hidden="true">
          {points.map((point, index) => (
            <span key={point.key}>{index % labelEvery === 0 ? point.label.replace("Semana de ", "") : ""}</span>
          ))}
        </div>
      </div>
      <details className="timeline-chart-table">
        <summary>Ver dados em tabela</summary>
        <div className="table-wrap">
          <table className="dashboard-table dashboard-numbers">
            <thead>
              <tr>
                <th>{unitLabel[0].toUpperCase() + unitLabel.slice(1)}</th>
                <th>Abertas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td>{point.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
