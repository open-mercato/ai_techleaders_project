import {
  Booking,
  MentorProfile,
  Slot,
  closeOrm,
  getOrm,
} from '@devmentor/db';

const MINUTE = 60_000;

const orm = await getOrm();

try {
  const em = orm.em.fork();
  const fixture = await em.transactional(async (tx) => {
    const ada = await tx.findOne(
      MentorProfile,
      { user: { email: 'ada@devmentor.dev' } },
      { populate: ['user'] },
    );
    const mockMentor = await tx.findOne(
      MentorProfile,
      { user: { email: 'mock-mentor@devmentor.test' } },
      { populate: ['user'] },
    );
    if (ada === null || mockMentor === null) {
      throw new Error('Run npm run db:seed before the Lesson 14 recording seed.');
    }

    // A recording reset owns this disposable database. Clearing bookings first preserves
    // the FK order and makes every take start without a live 30-minute hold.
    await tx.nativeDelete(Booking, {});
    await tx.nativeDelete(Slot, {});

    const now = new Date();
    const soon = new Date(Math.ceil((now.getTime() + 30 * MINUTE) / MINUTE) * MINUTE);
    const later = new Date(Math.ceil((now.getTime() + 4 * 60 * MINUTE) / MINUTE) * MINUTE);
    const legacy = new Date(later.getTime() + 30 * MINUTE);

    Object.assign(ada, {
      bio: null,
      publicWorkUrl: 'https://github.com/ada-lovelace',
      stackTags: ['TypeScript'],
      slug: 'ada-legacy',
      price25Cents: 9_000,
      price50Cents: 18_000,
    });
    Object.assign(mockMentor, {
      bio: 'I help teams debug TypeScript systems before a release.',
      publicWorkUrl: 'https://github.com/mock-mentor',
      stackTags: ['TypeScript', 'React'],
      slug: 'mock-mentor',
      price25Cents: 9_000,
      price50Cents: 18_000,
    });

    // The database requires a slug whenever `published_at` is set. Flush the identity and
    // offer first so MikroORM cannot batch a transient published-without-slug row.
    await tx.flush();
    ada.publishedAt = now;
    ada.lastPublishedAvailabilityAt = now;
    mockMentor.publishedAt = now;
    mockMentor.lastPublishedAvailabilityAt = now;

    tx.create(Slot, { mentorProfile: mockMentor, startsAt: soon, removedAt: null });
    tx.create(Slot, { mentorProfile: mockMentor, startsAt: later, removedAt: null });
    tx.create(Slot, { mentorProfile: ada, startsAt: legacy, removedAt: null });
    await tx.flush();

    return { soon: soon.toISOString(), later: later.toISOString() };
  });

  process.stdout.write(`Lesson 14 fixtures ready: soon=${fixture.soon}, later=${fixture.later}\n`);
} finally {
  await closeOrm();
}
