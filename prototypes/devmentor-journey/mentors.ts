import type { MentorListing, MentorReview } from '@devmentor/ui';
import { DEMO_NOW, INITIAL_SLOTS, type Slot } from './flow';

export interface PrototypeMentor extends MentorListing {
  bio: string[];
  specialties: { title: string; description: string }[];
  availableSlots: string[];
}

/** Fictional catalogue records. The host supplies Alex's editable prices and reviews. */
const OTHER_MENTORS: PrototypeMentor[] = [
  {
    id: 'maya-patel', name: 'Maya Patel', initials: 'MP',
    headline: 'Python developer working on APIs and data imports',
    introduction: 'I help you trace Python errors, test Django endpoints and make data imports easier to debug.',
    stacks: ['Python', 'Django', 'PostgreSQL'], topics: ['Debugging', 'API testing', 'Data imports'],
    languages: ['English', 'Hindi'], timeZone: 'Asia/Kolkata',
    price25: 150, price50: 280, averageRating: 4.8, reviewCount: 12,
    nextAvailableAt: '2026-09-11T10:00:00Z', availableSlots: ['2026-09-11T10:00:00Z', '2026-09-14T11:00:00Z'],
    bio: [
      'I work on Python services that receive data from other systems. Much of my day goes into understanding unexpected inputs, database queries and failures that are hard to reproduce.',
      'Bring an error, a failing test or a small sample of the data you are importing. We can trace what happens, write a test and work through the change together.',
    ],
    specialties: [
      { title: 'Python debugging', description: 'Follow the traceback and reduce an error to an example you can run on its own.' },
      { title: 'Django API tests', description: 'Check validation, permissions and database changes with tests that explain the intended behavior.' },
    ],
  },
  {
    id: 'lena-kowalska', name: 'Lena Kowalska', initials: 'LK',
    headline: 'Frontend engineer focused on accessible React interfaces',
    introduction: 'I help you build keyboard-friendly forms and write React tests around what people actually do.',
    stacks: ['React', 'TypeScript'], topics: ['Accessibility', 'Forms', 'React testing'],
    languages: ['English', 'Polish'], timeZone: 'Europe/Warsaw',
    price25: 220, price50: 400, averageRating: 4.9, reviewCount: 18,
    nextAvailableAt: '2026-09-12T09:00:00Z', availableSlots: ['2026-09-12T09:00:00Z', '2026-09-15T14:00:00Z'],
    bio: [
      'I build forms, account settings and component libraries in React. I pay particular attention to focus, clear validation and interfaces that work without a mouse.',
      'Show me the interaction you are unsure about. We can use it with a keyboard, identify where it breaks down and write a test for the behavior you want to keep.',
    ],
    specialties: [
      { title: 'Accessible forms', description: 'Connect labels and errors, manage focus after submission and keep recovery instructions clear.' },
      { title: 'React component tests', description: 'Test user actions and visible results with Testing Library instead of relying on component internals.' },
    ],
  },
  {
    id: 'tomasz-zielinski', name: 'Tomasz Zieliński', initials: 'TZ',
    headline: 'Backend developer working with Go and PostgreSQL',
    introduction: 'I help you read query plans, choose indexes and understand transactions in your Go service.',
    stacks: ['Go', 'PostgreSQL'], topics: ['SQL performance', 'Transactions', 'Backend architecture'],
    languages: ['English', 'Polish'], timeZone: 'Europe/Warsaw',
    price25: 120, price50: 220, averageRating: 4.7, reviewCount: 9,
    nextAvailableAt: '2026-09-18T10:00:00Z', availableSlots: ['2026-09-18T10:00:00Z', '2026-09-18T13:00:00Z'],
    bio: [
      'I work on Go services with PostgreSQL. I enjoy following a slow request through the application and checking which query, lock or extra round trip is causing the delay.',
      'Bring a query plan or a small example of a transaction. We can compare options and decide what to measure before changing the code.',
    ],
    specialties: [
      { title: 'PostgreSQL query plans', description: 'Read EXPLAIN output and decide whether an index or a different query would help.' },
      { title: 'Go service boundaries', description: 'Separate database work from request handling and test the error paths.' },
    ],
  },
  {
    id: 'sofia-martins', name: 'Sofia Martins', initials: 'SM',
    headline: 'React engineer working on Next.js applications',
    introduction: 'I help you untangle rendering, caching and data loading in a Next.js application.',
    stacks: ['React', 'Next.js', 'TypeScript'], topics: ['Rendering', 'Caching', 'Web performance'],
    languages: ['English', 'Portuguese'], timeZone: 'Europe/Lisbon',
    price25: 250, price50: 460, averageRating: 4.8, reviewCount: 15,
    nextAvailableAt: '2026-09-14T13:00:00Z', availableSlots: ['2026-09-14T13:00:00Z', '2026-09-16T09:00:00Z'],
    bio: [
      'I work on React applications with server rendering. I spend a lot of time deciding where data should load, what belongs on the client and how to keep a page responsive.',
      'We can take one route through your application and follow how it renders. Bring a small example and any timing or network information you have already collected.',
    ],
    specialties: [
      { title: 'Server and client components', description: 'Decide where interactivity and data access belong, then trace the data passed between them.' },
      { title: 'Caching and page performance', description: 'Identify repeated requests and check when a cached result should be refreshed.' },
    ],
  },
  {
    id: 'daniel-okafor', name: 'Daniel Okafor', initials: 'DO',
    headline: 'Node.js engineer working on service reliability',
    introduction: 'I help you handle failed requests, investigate Node.js errors and debug Docker builds.',
    stacks: ['Node.js', 'TypeScript', 'Docker'], topics: ['Error handling', 'API design', 'Deployment debugging'],
    languages: ['English'], timeZone: 'Africa/Lagos',
    price25: 300, price50: 560, averageRating: 4.9, reviewCount: 21,
    nextAvailableAt: null, availableSlots: [],
    bio: [
      'I build and maintain Node.js services. I work on the parts that become visible when something fails: timeouts, incomplete requests and logs that need enough context to explain a problem.',
      'Bring the error and the smallest piece of code that reproduces it. We can follow the request, decide how it should fail and write down the checks to run next.',
    ],
    specialties: [
      { title: 'Node.js error handling', description: 'Keep error responses useful, preserve context in logs and avoid retrying requests that should not be repeated.' },
      { title: 'Docker build failures', description: 'Compare the local environment with the container and identify missing files, dependencies or configuration.' },
    ],
  },
];

export function getPrototypeMentors(prices: { 25: number; 50: number }, reviews: MentorReview[], slots: Slot[] = INITIAL_SLOTS): PrototypeMentor[] {
  const availableSlots = slots.filter(slot => !slot.blockedReason && Date.parse(slot.start) >= DEMO_NOW + 2 * 60 * 60 * 1000).map(slot => slot.start).sort();
  return [{
    id: 'alex-laurent', name: 'Alex Laurent', initials: 'AL',
    headline: 'Staff engineer specialising in TypeScript & React',
    introduction: 'I help you simplify complex types, untangle React state and decide how your API should respond.',
    stacks: ['TypeScript', 'React', 'API design'], topics: ['Type narrowing', 'React state', 'API response design'],
    languages: ['English'], timeZone: 'Europe/Warsaw',
    price25: prices[25], price50: prices[50],
    averageRating: reviews.length ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length : 0,
    reviewCount: reviews.length, nextAvailableAt: availableSlots[0] ?? null, availableSlots,
    bio: [
      'I work on API types and how callers use them, the responsibilities of React components, and architecture choices that make a codebase easier to change.',
      'I like to start a session with a small example and hear how you understand the problem. We can compare options and choose a change that fits your code.',
    ],
    specialties: [
      { title: 'TypeScript types and narrowing', description: 'Use union types and API result types to express constraints the compiler can check.' },
      { title: 'React state and effects', description: 'Decide what belongs in a component, how to organise its state and effects, and when to split it up.' },
      { title: 'API response design', description: 'Compare response shapes and error contracts before other parts of the application depend on them.' },
    ],
  }, ...OTHER_MENTORS];
}
