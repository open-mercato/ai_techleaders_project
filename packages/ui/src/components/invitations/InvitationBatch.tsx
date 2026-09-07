import { type ReactNode } from 'react';
import { Card } from '../ui/card';
import { DataTable, type Column } from '../../backend/tables/DataTable';

export interface InvitationRecord {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'accepted' | 'published' | 'overdue';
  deadline: string;
}
export interface InvitationBatchProps {
  label: string;
  sent: number;
  capacity: number;
  state: 'open' | 'full' | 'stopped';
  invitations: InvitationRecord[];
  actions: ReactNode;
}

const invitationColumns: Column<InvitationRecord>[] = [
  { key: 'name', header: 'Mentor', render: invitation => <div>{invitation.name}<span className="dm-product-caption">{invitation.email}</span></div> },
  { key: 'status', header: 'Status', render: invitation => <span className="dm-product-status" data-tone={invitation.status === 'published' ? 'success' : invitation.status === 'overdue' ? 'error' : 'neutral'}>{invitation.status}</span> },
  { key: 'deadline', header: 'Publish by' },
];

export function InvitationBatch({ label, sent, capacity, state, invitations, actions }: InvitationBatchProps) {
  return <Card className="dm-product-panel"><div className="dm-product-row"><div><h3 className="dm-product-title">{label}</h3><p className="dm-product-muted">{sent} of {capacity} invitations sent</p></div><span className="dm-product-status" data-tone={state === 'open' ? 'information' : 'neutral'}>{state}</span></div><p className="dm-product-caption">Track whether each mentor publishes their first bookable session within 14 days of accepting the invitation.</p><DataTable caption={`Invitation progress for ${label}`} columns={invitationColumns} rows={invitations} getRowId={invitation => invitation.id} emptyMessage="No invitations in this batch yet." /><div className="dm-product-actions">{actions}</div></Card>;
}
