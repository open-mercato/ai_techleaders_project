import Link from "next/link";

/**
 * Public landing page. Per the architecture split, public/marketing pages use plain
 * Tailwind utility classes only — no shadcn-ui components (those are for /admin).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-4">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          DevMentor
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
          Grow faster with the right mentor.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          DevMentor connects developers with experienced mentors for pairing,
          reviews, and career guidance.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/mentors"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Find a mentor
        </Link>
        <Link
          href="/admin"
          className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Open the admin dashboard
        </Link>
        <a
          href="/api/health"
          className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Health check
        </a>
      </div>
    </main>
  );
}
