import { Card } from '../ui/card';

export interface OperatorMetric {
  id: string;
  label: string;
  value: string;
  context: string;
}
export interface MetricSummaryProps {
  period: string;
  metrics: OperatorMetric[];
  /** An absent value must be supplied as unavailable, not converted to zero. */
  updatedLabel: string;
}
export function MetricSummary({ period, metrics, updatedLabel }: MetricSummaryProps) {
  return <section className="dm-product-stack" aria-label="Operator metrics"><div><h2 className="dm-product-heading">Session metrics</h2><p className="dm-product-muted dm-meta-group"><span>{period}</span>{' '}<span>{updatedLabel}</span></p></div><div className="dm-product-grid">{metrics.map(metric => <Card key={metric.id} className="dm-product-panel dm-metric"><dl><dt>{metric.label}</dt><dd>{metric.value}</dd></dl><p className="dm-product-caption">{metric.context}</p></Card>)}</div></section>;
}
