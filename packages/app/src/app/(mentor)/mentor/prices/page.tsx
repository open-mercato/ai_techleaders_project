import { requirePageRole } from '../../../../lib/session';
import { MentorPricesClient } from './mentor-prices-client';

export const dynamic = 'force-dynamic';

export default async function MentorPricesPage() {
  await requirePageRole('mentor', '/mentor/prices');

  return <div className="flex flex-col gap-6">
    <header className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Session prices</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Set the price for each session length. Both prices are saved together.
      </p>
    </header>
    <MentorPricesClient />
  </div>;
}
