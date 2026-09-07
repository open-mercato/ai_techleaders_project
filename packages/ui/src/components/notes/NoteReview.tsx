import { type ReactNode } from 'react';
import { Card } from '../ui/card';

const noteStates = { draft: ['Draft', 'neutral'], 'awaiting-approval': ['Awaiting approval', 'warning'], approved: ['Approved', 'success'], declined: ['Changes requested', 'error'] } as const;
export interface NoteReviewProps {
  title: string;
  version: number;
  state: keyof typeof noteStates;
  body: ReactNode;
  author: string;
  updatedLabel: string;
  declineComment?: string;
  /** Compose authorized approval actions / existing CrudForm for a required decline comment. */
  actions?: ReactNode;
}

export function NoteReview({ title, version, state, body, author, updatedLabel, declineComment, actions }: NoteReviewProps) {
  const [label, tone] = noteStates[state];
  return <Card className="dm-product-panel dm-note-review"><div className="dm-product-row"><span className="dm-product-eyebrow dm-meta-group"><span>Private session note</span>{' '}<span>Version {version}</span></span><span className="dm-product-status" data-tone={tone}>{label}</span></div><h2 className="dm-product-heading">{title}</h2><p className="dm-product-muted dm-meta-group"><span>By {author}</span>{' '}<span>{updatedLabel}</span></p><div className="dm-product-prose">{body}</div>{declineComment && <blockquote className="dm-product-callout"><strong>Requested changes</strong><p>{declineComment}</p></blockquote>}<p className="dm-product-caption">This note is private. Approving it does not publish it.</p><div className="dm-product-actions">{actions}</div></Card>;
}

export interface NoteVersion {
  version: number;
  author: string;
  updatedAt: string;
  dateLabel: string;
  state: keyof typeof noteStates;
  detail: string;
}
export interface VersionHistoryProps { versions: NoteVersion[] }
export function VersionHistory({ versions }: VersionHistoryProps) {
  return <section className="dm-product-stack" aria-label="Note version history"><h3 className="dm-product-title">Version history</h3>{versions.length > 0 ? <ol className="dm-version-history">{versions.map(version => <li key={version.version}><div className="dm-product-row"><strong>Version {version.version}</strong><span className="dm-product-status" data-tone={noteStates[version.state][1]}>{noteStates[version.state][0]}</span></div><p className="dm-product-muted dm-meta-group"><span>{version.author}</span>{' '}<time dateTime={version.updatedAt}>{version.dateLabel}</time></p><p className="dm-product-copy">{version.detail}</p></li>)}</ol> : <p className="dm-product-muted">No saved versions yet.</p>}</section>;
}
