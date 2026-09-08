import { type ReactNode } from 'react';
import { Card } from '../ui/card';

export interface DisputeDetailProps {
  reference: string;
  state: 'open' | 'resolved';
  sessionLabel: string;
  reason: string;
  outcome?: string;
  /** Provide only transcript evidence the current operator is authorized to inspect. */
  evidence: ReactNode;
  actions?: ReactNode;
}
export function DisputeDetail({ reference, state, sessionLabel, reason, outcome, evidence, actions }: DisputeDetailProps) {
  return <Card className="dm-product-panel"><div className="dm-product-row"><h2 className="dm-product-heading">Dispute {reference}</h2><span className="dm-product-status" data-tone={state === 'resolved' ? 'success' : 'warning'}>{state}</span></div><p className="dm-product-muted">{sessionLabel}</p><div className="dm-product-prose"><h3 className="dm-product-title">Reported concern</h3><p>{reason}</p></div>{evidence}{outcome && <div className="dm-product-callout"><strong>Recorded outcome</strong><p>{outcome}</p></div>}<p className="dm-product-caption">Recording an outcome does not automatically issue a refund.</p><div className="dm-product-actions">{actions}</div></Card>;
}
