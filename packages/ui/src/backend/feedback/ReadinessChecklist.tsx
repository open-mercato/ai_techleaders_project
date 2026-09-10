import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Badge } from '../../components/ui/badge';

export interface ReadinessChecklistItem {
  key: string;
  label: string;
  met: boolean;
}

export interface ReadinessChecklistProps {
  items: ReadinessChecklistItem[];
  actionsByKey?: Record<string, ReactNode>;
  title?: ReactNode;
  description?: string;
}

/**
 * Present a server-evaluated readiness gate. Requirement keys remain data; callers map
 * them to local navigation without putting application routes in the domain DTO.
 */
export function ReadinessChecklist({
  items,
  actionsByKey = {},
  title = 'Ready to publish?',
  description = 'Complete each requirement before publishing your mentor page.',
}: ReadinessChecklistProps) {
  const headingId = useId();

  return <section className="dm-mentor-onboarding" aria-labelledby={headingId}>
    <header className="dm-mentor-onboarding-heading">
      <div>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
    {items.length === 0 ? (
      <p className="dm-mentor-onboarding-empty">No requirements to complete.</p>
    ) : (
      <ol className="dm-mentor-onboarding-steps">
        {items.map((item, index) => {
          const action = item.met ? undefined : actionsByKey[item.key];
          return <li key={item.key} data-complete={item.met}>
            <span className="dm-mentor-onboarding-marker" aria-hidden="true">
              {item.met ? <Check /> : index + 1}
            </span>
            <div className="dm-mentor-onboarding-step-copy">
              <div className="dm-mentor-onboarding-step-title">
                <h3>{item.label}</h3>
                <Badge variant={item.met ? 'success' : 'outline'}>
                  {item.met ? 'Complete' : 'Required'}
                </Badge>
              </div>
            </div>
            {action ? <div className="dm-mentor-onboarding-action">{action}</div> : null}
          </li>;
        })}
      </ol>
    )}
  </section>;
}
