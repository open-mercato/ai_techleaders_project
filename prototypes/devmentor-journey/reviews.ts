import type { MentorReview } from '@devmentor/ui';

/** Fictional examples only, dated before the prototype's scenario clock. */
export const INITIAL_REVIEWS: MentorReview[] = [
  { id: 'example-maya', reviewerName: 'Maya Chen', rating: 5, createdAt: '2026-09-06', dateLabel: '6 September 2026', text: 'We reduced a confusing union to a small example and worked through it together. The written explanation helped me finish the change the next day.' },
  { id: 'example-leo', reviewerName: 'Leo Martin', rating: 4, createdAt: '2026-09-04', dateLabel: '4 September 2026', text: 'Alex helped me separate state from effects in a React component. I would book 50 minutes next time so we have more room to compare the alternatives.' },
  { id: 'example-sam', reviewerName: 'Sam Rivera', rating: 5, createdAt: '2026-09-01', dateLabel: '1 September 2026', text: 'A practical discussion of our API response shape. I left understanding the trade-off, with two specific tests to write.' },
];
