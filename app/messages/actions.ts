"use server";

import { revalidatePath } from "next/cache";
import { Message } from "@/lib/db/entities/message";
import { getEm } from "@/lib/db/orm";
import { validateMessageBody } from "@/lib/messages";

export type MessageFormState = {
  error?: string;
  submitted?: boolean;
};

export async function createMessage(
  _prevState: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const result = validateMessageBody(formData.get("body"));

  if (!result.ok) {
    return { error: result.error };
  }

  const em = await getEm();
  em.create(Message, { body: result.value });
  await em.flush();

  revalidatePath("/messages");
  return { submitted: true };
}
