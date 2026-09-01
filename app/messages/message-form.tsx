"use client";

import { useActionState } from "react";
import { createMessage, type MessageFormState } from "./actions";

const initialState: MessageFormState = {};

export function MessageForm() {
  const [state, formAction, pending] = useActionState(
    createMessage,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <label htmlFor="body" className="text-sm font-medium">
        New message
      </label>
      <div className="flex gap-2">
        {/* Intentionally not `required`: browser-native validation would block
            submission, making the server-side validation unreachable from tests. */}
        <input
          id="body"
          name="body"
          type="text"
          autoComplete="off"
          data-testid="message-input"
          placeholder="Say something"
          className="flex-1 rounded border border-black/[.12] px-3 py-2 dark:border-white/[.18]"
        />
        <button
          type="submit"
          disabled={pending}
          data-testid="message-submit"
          className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving..." : "Add"}
        </button>
      </div>
      {state.error ? (
        <p
          role="alert"
          data-testid="message-error"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
