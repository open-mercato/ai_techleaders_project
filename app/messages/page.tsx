import { Message } from "@/lib/db/entities/message";
import { getEm } from "@/lib/db/orm";
import { MessageForm } from "./message-form";

// Reads the database on every request, so it must never be prerendered at build
// time — `next build` runs without a DATABASE_URL.
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const em = await getEm();
  const messages = await em.find(
    Message,
    {},
    { orderBy: { createdAt: "desc", id: "desc" }, limit: 50 },
  );

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 bg-white px-16 py-24 dark:bg-black">
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>

        <MessageForm />

        <ul data-testid="message-list" className="flex flex-col gap-2">
          {messages.length === 0 ? (
            <li data-testid="message-empty" className="text-zinc-500">
              No messages yet.
            </li>
          ) : (
            messages.map((message) => (
              <li
                key={message.id}
                data-testid="message-item"
                className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.12]"
              >
                {message.body}
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}
