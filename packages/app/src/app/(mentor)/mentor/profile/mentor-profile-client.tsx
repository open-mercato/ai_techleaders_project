'use client';

import { mentorProfileUpdateSchema } from '@devmentor/core/validators/mentors/mentor-profile-update.schema';
import { Button, Card } from '@devmentor/ui';
import { MentorPageView } from '@devmentor/ui/components/mentors/MentorPageView';
import {
  apiCall,
  CrudForm,
  ErrorMessage,
  ReadinessChecklist,
  ResourcePanel,
  useApiResource,
  type FieldErrors,
} from '@devmentor/ui/backend';
import { useState } from 'react';

export interface MentorProfileClientProps {
  appUrl: string;
  stackOptions: readonly { label: string; value: string }[];
}

/** Browser-facing shape of the owner projection; kept structural so this client stays db-free. */
export interface MentorProfileResource {
  id: string;
  displayName: string;
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: readonly string[];
  slug: string | null;
  publishedAt: string | null;
  readiness: {
    ready: boolean;
    items: { key: string; label: string; met: boolean }[];
  };
}

function ShareLink({ appUrl, slug, published }: { appUrl: string; slug: string; published: boolean }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const shareUrl = new URL(`/m/${slug}`, appUrl).toString();

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return <Card className="dm-product-panel">
    <div>
      <h2 className="dm-product-heading">Your share link</h2>
      <p className="dm-product-muted">
        The link will not change if you rename yourself.
      </p>
    </div>
    <a className="break-all font-medium text-primary underline underline-offset-4" href={shareUrl}>
      {shareUrl}
    </a>
    {!published ? <p className="dm-product-callout">This page is hidden until you publish it again.</p> : null}
    <div className="dm-product-actions">
      <Button type="button" variant="outline" onClick={() => void copy()}>Copy link</Button>
    </div>
    {copyState === 'copied' ? <p role="status">Link copied.</p> : null}
    {copyState === 'failed' ? <ErrorMessage message="Copy failed. Select the link and copy it manually." /> : null}
  </Card>;
}

export function MentorProfileClient({ appUrl, stackOptions }: MentorProfileClientProps) {
  const resource = useApiResource<MentorProfileResource>('/api/mentors/me');
  const [saving, setSaving] = useState(false);
  const [transition, setTransition] = useState<'publish' | 'unpublish' | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [publishFieldErrors, setPublishFieldErrors] = useState<FieldErrors | undefined>();

  async function changePublication(action: 'publish' | 'unpublish') {
    setTransition(action);
    setTransitionError(null);
    setPublishFieldErrors(undefined);
    try {
      const result = await apiCall<MentorProfileResource>(`/api/mentors/me/${action}`, { method: 'POST' });
      if (result.ok) {
        resource.reload();
      } else if (result.error.fieldErrors !== undefined) {
        setPublishFieldErrors(result.error.fieldErrors);
      } else {
        setTransitionError(result.error.message);
      }
    } catch {
      setTransitionError('We could not update publication. Try again.');
    } finally {
      setTransition(null);
    }
  }

  return <ResourcePanel resource={resource} loadingMessage="Loading your mentor page…">
    {(profile) => <div className="flex flex-col gap-6">
      <Card className="dm-product-panel">
        <div>
          <h2 className="dm-product-heading">Profile details</h2>
          <p className="dm-product-muted">Save a draft at any time. Publishing has its own completeness check.</p>
        </div>
        <CrudForm
          schema={mentorProfileUpdateSchema}
          fields={[
            {
              name: 'publicWorkUrl',
              label: 'Public work link',
              type: 'text',
              placeholder: 'https://github.com/your-name',
              description: 'Link to code, writing or another public example of your work.',
            },
            {
              name: 'bio',
              label: 'About your work',
              type: 'textarea',
              placeholder: 'Describe what you have built and the problems you can help solve.',
            },
            {
              name: 'stackTags',
              label: 'Technologies',
              type: 'multiselect',
              description: 'Choose up to four.',
              options: [...stackOptions],
            },
          ]}
          endpoint="/api/mentors/me"
          method="PUT"
          initialValues={{
            publicWorkUrl: profile.publicWorkUrl ?? '',
            bio: profile.bio ?? '',
            stackTags: [...profile.stackTags],
          }}
          externalFieldErrors={publishFieldErrors}
          submitLabel="Save profile"
          onSubmittingChange={(pending) => {
            setSaving(pending);
            if (pending) setPublishFieldErrors(undefined);
          }}
          onSuccess={resource.reload}
        />
      </Card>

      <ReadinessChecklist items={profile.readiness.items} />

      <Card className="dm-product-panel">
        <div>
          <h2 className="dm-product-heading">Publication</h2>
          <p className="dm-product-muted">
            {profile.publishedAt === null
              ? 'Publish when your page is ready for anyone with the link to open.'
              : 'Your mentor page is public. Unpublishing hides it without deleting your profile.'}
          </p>
        </div>
        <div className="dm-product-actions">
          {profile.publishedAt === null ? (
            <Button type="button" disabled={saving || transition !== null} aria-busy={transition === 'publish'}
              onClick={() => void changePublication('publish')}>
              {transition === 'publish' ? 'Publishing…' : 'Publish page'}
            </Button>
          ) : (
            <Button type="button" variant="destructive" disabled={saving || transition !== null} aria-busy={transition === 'unpublish'}
              onClick={() => void changePublication('unpublish')}>
              {transition === 'unpublish' ? 'Unpublishing…' : 'Unpublish page'}
            </Button>
          )}
        </div>
        {transitionError ? <ErrorMessage message={transitionError} /> : null}
      </Card>

      {profile.slug !== null ? <ShareLink appUrl={appUrl} slug={profile.slug} published={profile.publishedAt !== null} /> : null}

      {profile.readiness.ready && profile.publicWorkUrl !== null && profile.bio !== null ? (
        <section aria-labelledby="mentor-page-preview-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="mentor-page-preview-heading" className="dm-product-heading">Page preview</h2>
            <p className="dm-product-muted">This is what visitors see when your page is published.</p>
          </div>
          <MentorPageView
            profile={{
              displayName: profile.displayName,
              publicWorkUrl: profile.publicWorkUrl,
              bio: profile.bio,
              stackTags: [...profile.stackTags],
            }}
          />
        </section>
      ) : null}
    </div>}
  </ResourcePanel>;
}
