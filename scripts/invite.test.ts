import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ withScope: vi.fn(), write: vi.spyOn(console, 'log') }));
vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withScope: harness.withScope,
}));

const { main, runInvite } = await import('./invite');

function effects() {
  return {
    invitationService: {
      create: vi.fn().mockResolvedValue({
        id: 'inv-1',
        email: 'ada@example.com',
        link: 'https://devmentor.test/invitation/SECRET',
        expiresAt: '2026-09-24T12:00:00.000Z',
      }),
      revoke: vi.fn().mockResolvedValue({ id: 'inv-1' }),
      resend: vi.fn().mockResolvedValue({
        id: 'inv-1',
        link: 'https://devmentor.test/invitation/NEW-SECRET',
        expiresAt: '2026-09-24T12:00:00.000Z',
      }),
    },
    writeLine: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.write.mockImplementation(() => undefined);
});

describe('runInvite', () => {
  it('creates a normalized, tagged invitation and prints a separate audit line and link', async () => {
    const io = effects();
    await runInvite(
      [
        'create',
        ' Ada@Example.COM ',
        '--operator',
        'founder-a',
        '--tags',
        'TypeScript, React',
        '--batch',
        'pilot-1',
      ],
      io,
    );
    expect(io.invitationService.create).toHaveBeenCalledWith({
      email: 'ada@example.com',
      stackTags: ['TypeScript', 'React'],
      batch: 'pilot-1',
    });
    expect(io.writeLine.mock.calls).toEqual([
      ['operator=founder-a action=create invitation=inv-1 email=ada@example.com'],
      ['https://devmentor.test/invitation/SECRET'],
    ]);
    expect(io.writeLine.mock.calls[0]?.[0]).not.toContain('SECRET');
  });

  it('creates without an optional batch', async () => {
    const io = effects();
    await runInvite(
      ['create', 'ada@example.com', '--operator', 'A', '--tags', 'Python'],
      io,
    );
    expect(io.invitationService.create).toHaveBeenCalledWith({
      email: 'ada@example.com',
      stackTags: ['Python'],
    });
  });

  it('revokes without ever printing a raw link', async () => {
    const io = effects();
    await runInvite(['revoke', ' inv-1 ', '--operator', 'founder-a'], io);
    expect(io.invitationService.revoke).toHaveBeenCalledWith('inv-1');
    expect(io.writeLine).toHaveBeenCalledExactlyOnceWith(
      'operator=founder-a action=revoke invitation=inv-1',
    );
  });

  it('resends and prints the rotated link separately', async () => {
    const io = effects();
    await runInvite(['resend', 'inv-1', '--operator', 'founder-a'], io);
    expect(io.invitationService.resend).toHaveBeenCalledWith('inv-1');
    expect(io.writeLine.mock.calls).toEqual([
      ['operator=founder-a action=resend invitation=inv-1'],
      ['https://devmentor.test/invitation/NEW-SECRET'],
    ]);
  });

  it.each([
    [[], 'Usage'],
    [['delete', 'inv-1', '--operator', 'A'], 'Usage'],
    [['revoke'], 'target'],
    [['revoke', ' ', '--operator', 'A'], 'target'],
    [['revoke', 'inv-1'], '--operator'],
    [['revoke', 'inv-1', '--operator'], 'requires a value'],
    [['revoke', 'inv-1', '--operator', '  '], '--operator'],
    [['create', 'ada@example.com', '--operator', 'A'], '--tags'],
    [['create', 'ada@example.com', '--operator', 'A', '--tags'], 'requires a value'],
    [
      ['create', 'ada@example.com', '--operator', 'A', '--tags', 'React,Python,TypeScript,AI agents,React'],
      'at most four',
    ],
    [['create', 'ada@example.com', '--operator', 'A', '--tags', 'Rust'], 'must be one of'],
    [['create', 'not-an-email', '--operator', 'A', '--tags', 'React'], 'valid email'],
    [
      ['create', 'ada@example.com', '--operator', 'A', '--tags', 'React', '--batch'],
      'requires a value',
    ],
  ])('rejects invalid arguments %#', async (args, message) => {
    await expect(runInvite(args as string[], effects())).rejects.toThrow(message as string);
  });
});

describe('main', () => {
  it('uses process arguments by default and writes through the system scope', async () => {
    const io = effects();
    const original = process.argv;
    process.argv = ['node', 'invite.ts', 'revoke', 'inv-1', '--operator', 'A'];
    harness.withScope.mockImplementation((run: (cradle: unknown) => unknown) =>
      run({ invitationService: io.invitationService }),
    );
    try {
      await main();
    } finally {
      process.argv = original;
    }
    expect(harness.write).toHaveBeenCalledWith('operator=A action=revoke invitation=inv-1');
  });

  it('accepts explicit arguments', async () => {
    const io = effects();
    harness.withScope.mockImplementation((run: (cradle: unknown) => unknown) =>
      run({ invitationService: io.invitationService }),
    );
    await main(['resend', 'inv-1', '--operator', 'A']);
    expect(harness.write).toHaveBeenCalledWith('https://devmentor.test/invitation/NEW-SECRET');
  });
});
