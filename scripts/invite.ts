import { StackTags, withScope, type InvitationService, type StackTag } from '@devmentor/core';

type InviteService = Pick<InvitationService, 'create' | 'revoke' | 'resend'>;

export interface InviteEffects {
  invitationService: InviteService;
  writeLine(value: string): void;
}

type ParsedCommand =
  | {
      action: 'create';
      target: string;
      operator: string;
      stackTags: StackTag[];
      batch?: string;
    }
  | { action: 'revoke' | 'resend'; target: string; operator: string };

const USAGE =
  'Usage: npm run invite -- <create|revoke|resend> <email-or-id> --operator <label> ' +
  '[--tags TypeScript,React] [--batch label]';

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value. ${USAGE}`);
  }
  return value.trim();
}

function parseCommand(args: string[]): ParsedCommand {
  const [action, target] = args;
  if (action !== 'create' && action !== 'revoke' && action !== 'resend') {
    throw new Error(USAGE);
  }
  if (target === undefined || target.trim() === '') {
    throw new Error(`A target is required. ${USAGE}`);
  }
  const operator = option(args, '--operator');
  if (!operator) {
    throw new Error(`--operator is required for the shared audit note. ${USAGE}`);
  }

  if (action !== 'create') {
    return { action, target: target.trim(), operator };
  }

  const tags = option(args, '--tags');
  if (!tags) {
    throw new Error(`--tags is required when creating an invitation. ${USAGE}`);
  }
  const stackTags = tags.split(',').map((tag) => tag.trim());
  if (stackTags.length > 4) {
    throw new Error('An invitation may include at most four stack tags.');
  }
  const parsedTags = StackTags.schema.array().safeParse(stackTags);
  if (!parsedTags.success) {
    throw new Error(`Stack tags must be one of: ${StackTags.values.join(', ')}.`);
  }
  const normalizedEmail = target.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new Error('Create requires a valid email address.');
  }
  const batch = option(args, '--batch');
  return {
    action,
    target: normalizedEmail,
    operator,
    stackTags: parsedTags.data,
    ...(batch ? { batch } : {}),
  };
}

export async function runInvite(args: string[], effects: InviteEffects): Promise<void> {
  const command = parseCommand(args);
  if (command.action === 'create') {
    const result = await effects.invitationService.create({
      email: command.target,
      stackTags: command.stackTags,
      ...(command.batch ? { batch: command.batch } : {}),
    });
    effects.writeLine(
      `operator=${command.operator} action=create invitation=${result.id} email=${result.email}`,
    );
    effects.writeLine(result.link);
    return;
  }

  if (command.action === 'revoke') {
    const result = await effects.invitationService.revoke(command.target);
    effects.writeLine(
      `operator=${command.operator} action=revoke invitation=${result.id}`,
    );
    return;
  }

  const result = await effects.invitationService.resend(command.target);
  effects.writeLine(`operator=${command.operator} action=resend invitation=${result.id}`);
  effects.writeLine(result.link);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  await withScope(({ invitationService }) =>
    runInvite(args, {
      invitationService,
      writeLine: (value) => console.log(value),
    }),
  );
}
