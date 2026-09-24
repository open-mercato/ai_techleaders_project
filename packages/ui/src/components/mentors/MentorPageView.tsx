import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { TechnologyIcon } from './TechnologyChips';
import { SlotTime } from '../availability/SlotTime';
import { priceLabel } from '../../lib/money';

export interface MentorPageProfile {
  displayName: string;
  publicWorkUrl: string;
  bio: string;
  stackTags: string[];
  slots?: { id: string; startsAt: string; meetsLeadTime: boolean }[];
  prices?: { price25Cents: number; price50Cents: number; currency: string } | null;
}

export interface MentorPageViewProps {
  profile: MentorPageProfile;
  actions?: ReactNode;
}

/** The public mentor-page body, shared with the mentor's own preview. */
export function MentorPageView({ profile, actions }: MentorPageViewProps) {
  return <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 dark:border-slate-800 dark:bg-slate-900">
    <header className="flex flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">DevMentor</p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-slate-50">{profile.displayName}</h1>
      <a
        className="inline-flex w-fit items-center gap-2 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700 dark:hover:text-blue-100"
        href={profile.publicWorkUrl}
        target="_blank"
        rel="noreferrer"
      >
        View public work
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>
    </header>

    <section aria-labelledby="mentor-about-heading" className="flex flex-col gap-3">
      <h2 id="mentor-about-heading" className="text-xl font-semibold text-slate-950 dark:text-slate-50">About</h2>
      <p className="whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-300">{profile.bio || 'undefined'}</p>
    </section>

    <section aria-labelledby="mentor-technologies-heading" className="flex flex-col gap-3">
      <h2 id="mentor-technologies-heading" className="text-xl font-semibold text-slate-950 dark:text-slate-50">Technologies</h2>
      <ul className="flex flex-wrap gap-2" aria-label="Technology stacks">
        {profile.stackTags.map((stack) => <li key={stack} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <TechnologyIcon stack={stack} />
          <span>{stack}</span>
        </li>)}
      </ul>
    </section>

    <section aria-labelledby="mentor-prices-heading" className="flex flex-col gap-3">
      <h2 id="mentor-prices-heading" className="text-xl font-semibold text-slate-950 dark:text-slate-50">Session prices</h2>
      {profile.prices ? (
        <ul className="flex flex-wrap gap-2" aria-label="Session prices">
          <li className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            25 minutes: {priceLabel(profile.prices.price25Cents, profile.prices.currency)}
          </li>
          <li className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            50 minutes: {priceLabel(profile.prices.price50Cents, profile.prices.currency)}
          </li>
        </ul>
      ) : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Not bookable yet</p>}
    </section>

    <section aria-labelledby="mentor-availability-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="mentor-availability-heading" className="text-xl font-semibold text-slate-950 dark:text-slate-50">Available times</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Times use your current timezone. A session must be requested at least two hours before it starts.</p>
      </div>
      {profile.slots?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {profile.slots.map((slot) => <li key={slot.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <SlotTime startsAt={slot.startsAt} meetsLeadTime={slot.meetsLeadTime} />
          </li>)}
        </ul>
      ) : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">No future times are published. Check this page again later.</p>}
    </section>

    {actions ? <footer className="flex flex-wrap gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">{actions}</footer> : null}
  </article>;
}
