import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '../ui/badge';

export interface MentorOnboardingStep {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  action?: ReactNode;
}

export interface MentorOnboardingProps {
  steps: MentorOnboardingStep[];
  dueDateLabel?: string;
  title?: string;
  description?: string;
}

/** The host supplies completion and deadline data; this checklist never grants access. */
export function MentorOnboarding({
  steps,
  dueDateLabel,
  title = 'Set up your mentor profile',
  description = 'Complete your profile, set your prices and add time for sessions.',
}: MentorOnboardingProps) {
  const headingId = useId();
  const completeCount = steps.filter(step => step.complete).length;

  return <section className="dm-mentor-onboarding" aria-labelledby={headingId}>
    <header className="dm-mentor-onboarding-heading">
      <div>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      {dueDateLabel && <Badge variant="outline">Publish by {dueDateLabel}</Badge>}
    </header>
    {steps.length ? <>
      <div className="dm-mentor-onboarding-progress">
        <p>{completeCount} of {steps.length} steps complete</p>
        <progress aria-label="Mentor setup progress" value={completeCount} max={steps.length} />
      </div>
      <ol className="dm-mentor-onboarding-steps">
        {steps.map((step, index) => <li key={step.id} data-complete={step.complete}>
          <span className="dm-mentor-onboarding-marker" aria-hidden="true">
            {step.complete ? <Check /> : index + 1}
          </span>
          <div className="dm-mentor-onboarding-step-copy">
            <div className="dm-mentor-onboarding-step-title">
              <h3>{step.title}</h3>
              {step.complete && <span className="dm-mentor-onboarding-complete">Complete</span>}
            </div>
            <p>{step.description}</p>
          </div>
          {step.action && <div className="dm-mentor-onboarding-action">{step.action}</div>}
        </li>)}
      </ol>
    </> : <p className="dm-mentor-onboarding-empty">No setup tasks.</p>}
  </section>;
}
