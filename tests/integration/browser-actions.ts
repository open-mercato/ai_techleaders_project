import { runAgentBrowser } from './agent-browser';

interface SnapshotRef {
  role: string;
  name: string;
}

/**
 * Click what the accessibility tree *names*, rather than a guessed CSS path.
 *
 * `AGENTS.md` asks scenarios to observe the live accessibility tree and assert on semantic
 * roles and text; this is the acting half of that. `snapshot -i --json` returns
 * `refs: { e1: { role, name } }`, and refs are reassigned on every snapshot, so a fresh one
 * is taken each time rather than cached.
 *
 * `occurrence` picks between same-named controls — a dialog's confirm button usually shares
 * its trigger's label, and `'last'` is the one inside the dialog.
 */
export async function clickNamed(
  session: string,
  role: string,
  name: RegExp,
  occurrence: 'first' | 'last' = 'first',
): Promise<void> {
  const payload = JSON.parse(await runAgentBrowser(session, 'snapshot', '-i', '--json')) as {
    data: { refs: Record<string, SnapshotRef> };
  };
  const matches = Object.entries(payload.data.refs).filter(
    ([, ref]) => ref.role === role && name.test(ref.name),
  );
  const entry = occurrence === 'last' ? matches.at(-1) : matches.at(0);
  if (entry === undefined) {
    throw new Error(
      `No ${role} named ${String(name)} in the tree. Present: `
      + Object.values(payload.data.refs).map((ref) => `${ref.role} "${ref.name}"`).join(', '),
    );
  }
  await runAgentBrowser(session, 'click', `@${entry[0]}`);
}
