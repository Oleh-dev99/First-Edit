/** The key metric tiles at the top of a store analytics dashboard. */
export interface Props {
  title: string;
  /** The period the metrics cover, e.g. "Last 30 days". */
  periodLabel: string;
  /** ISO 4217 code used for currency values, e.g. "USD". */
  currency: string;
  metrics: Metric[];
}

export type MetricFormat = 'currency' | 'percent' | 'count';

export interface Metric {
  id: string;
  label: string;
  /** Raw value. For "percent", a fraction: 0.034 means 3.4%. */
  value: number;
  format: MetricFormat;
  /** Change against the previous period, as a fraction: -0.052 means -5.2%. */
  change: number;
  caption: string;
}
