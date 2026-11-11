import { useId, useMemo } from "react";
import type { SessionJournal } from "./session-history";
import { chartCoordinates, historicalProgress } from "./history-charts";
import "./history-charts.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const accuracy = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;

function Trend({
  title,
  values,
  percentage = false,
}: {
  title: string;
  values: (number | null)[];
  percentage?: boolean;
}) {
  const id = useId();
  const { min, max, zero, points } = chartCoordinates(values, percentage);
  const format = percentage ? accuracy : (value: number) => money(value);
  return (
    <figure className="history-trend">
      <figcaption id={id}>{title}</figcaption>
      {points.some(Boolean) ? (
        <>
          <div className="trend-range">
            <span>Top: {format(max)}</span>
            <span>Bottom: {format(min)}</span>
          </div>
          <svg viewBox="0 0 600 160" role="img" aria-labelledby={id}>
            <desc>
              Cumulative results by ended session, oldest to newest. Exact
              values are in the progress data table below.
            </desc>
            <line
              className="trend-baseline"
              x1="40"
              x2="560"
              y1={zero}
              y2={zero}
            />
            <polyline
              className="trend-line"
              points={points
                .filter((point) => point !== null)
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
            />
            {points.map(
              (point, index) =>
                point && (
                  <circle key={index} cx={point.x} cy={point.y} r="4">
                    <title>
                      Session {index + 1}: {format(values[index]!)}
                    </title>
                  </circle>
                ),
            )}
          </svg>
          <div className="trend-range">
            <span>Session 1</span>
            {values.length > 1 && <span>Session {values.length}</span>}
          </div>
        </>
      ) : (
        <p className="form-note">No scored decisions yet.</p>
      )}
    </figure>
  );
}

export default function HistoryCharts({
  sessions,
}: {
  sessions: SessionJournal[];
}) {
  const points = useMemo(() => historicalProgress(sessions), [sessions]);
  if (!points.length) return null;
  return (
    <section className="history-charts" aria-label="Historical charts">
      <h3>Progress over time</h3>
      <p className="form-note">
        Oldest to newest ended session, equally spaced. Accuracy is
        decision-weighted; profit includes settled rounds only. Different rules,
        wagers, and practice filters may affect comparisons.
      </p>
      <Trend
        title="Cumulative accuracy"
        values={points.map((point) => point.accuracy)}
        percentage
      />
      <Trend
        title="Cumulative settled profit"
        values={points.map((point) => point.profit)}
      />
      <details className="progress-data">
        <summary>View progress data</summary>
        <div
          className="progress-table-scroll"
          role="region"
          aria-label="Progress data"
          tabIndex={0}
        >
          <table>
            <caption>Cumulative results after each ended session</caption>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Ended</th>
                <th scope="col">Correct / decisions</th>
                <th scope="col">Accuracy</th>
                <th scope="col">Profit</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.session}>
                  <th scope="row">{point.session}</th>
                  <td>
                    {point.endedAt === null
                      ? "Unknown"
                      : new Date(point.endedAt).toLocaleString()}
                  </td>
                  <td>
                    {point.correct} / {point.decisions}
                  </td>
                  <td>{accuracy(point.accuracy)}</td>
                  <td>{money(point.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
