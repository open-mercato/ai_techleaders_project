/**
 * Negative assertions for accessibility snapshots — **F7** of
 * `.ai/specs/2026-09-04-platform-primitives.md`.
 *
 * The recurring shape is "the tree must *not* contain this": no `searchbox` (#20), no audio
 * or video control (#26), no textbox for the mentee (#28), and **no "become a mentor" path
 * anywhere** (R07, asserted by `roles.integration.test.ts`).
 *
 * ## Why this is not `expect(snapshot).not.toContain(...)`
 *
 * A bare `.not.toContain` is the least trustworthy assertion in a browser suite, because
 * every way of *failing to look* also passes it:
 *
 * - the navigation redirected to `/sign-in`, so the snapshot is of a different page;
 * - the render crashed and the tree is a bare `RootWebArea`;
 * - the `wait` timed out and the snapshot was taken mid-load;
 * - the role or the spelling in the query is wrong, so nothing would ever have matched.
 *
 * All four report a green test for a screen nobody looked at. So `expectAbsent` takes a
 * mandatory third argument — a **positive control**: nodes that must be in the *same*
 * snapshot. The absence is only reported as proven once the tree has been shown to contain
 * the things it is supposed to contain. That is F7's `{ role?, text? }` sketch plus the one
 * piece it left to the caller to remember, made impossible to forget by the type system.
 *
 * ## Accessible names are matched **exactly**, not by substring
 *
 * A `string` `text` must equal the node's accessible name (case-insensitively); pass a
 * `RegExp` when a partial or fuzzy match is what you mean. This is not pedantry — the
 * substring default is a live trap in this app. `AppShell`'s topbar says *"Your DevMentor
 * workspace"*, which **contains** the mentor navigation label *"Mentor workspace"*. A
 * substring assertion that no mentor surface leaked onto the mentee's screen would fail on
 * every mentee page, for a reason that has nothing to do with roles. Exact names also make
 * the query say the same thing the screen reader says.
 *
 * ## It parses the tree instead of grepping the text
 *
 * `role` and `text` are matched against a parsed node, so `link "Users"` cannot be satisfied
 * by the word `Users` appearing inside a paragraph, and a node with no accessible name
 * cannot accidentally match a query for one. Lines the parser does not recognise contribute
 * no nodes — and a snapshot that yields **zero** nodes is a hard failure, never a pass,
 * which is the fail-safe direction for a helper whose whole job is to assert nothing.
 *
 * Failures throw an `Error` carrying the query, the control, and a preview of the tree.
 * A `toContain` diff of a 200-line snapshot says what is there; the message below says what
 * was looked for and why the conclusion could not be drawn.
 */

/** How much of a snapshot a failure message quotes back. */
const PREVIEW_LINES = 40;

/** One parsed node of an agent-browser accessibility snapshot. */
interface SnapshotNode {
  /** The ARIA/AX role token, e.g. `link`, `heading`, `StaticText`. */
  readonly role: string;
  /** The accessible name, unquoted; `''` for a node that has none. */
  readonly name: string;
  /** The original line, for failure messages. */
  readonly line: string;
}

/**
 * A node to look for. F7's shape: role, accessible name, or both.
 *
 * Omitting `role` matches any node with that name — which is how prose is caught, since
 * a text run appears as a named `StaticText` node. Omitting `text` matches every node of
 * that role, which is the `searchbox`/`textbox` form of the assertion.
 */
export interface NodeQuery {
  role?: string;
  text?: string | RegExp;
}

/**
 * The positive control: what makes the absence meaningful.
 *
 * `provenBy` must be non-empty and every entry must be found, so the caller states, at the
 * assertion site, what "this tree loaded" means for this screen. Prefer nodes that only the
 * intended screen has — its `heading`, its own navigation links — over chrome that every
 * page shares, since chrome would still be there after a redirect to the wrong page.
 */
export interface AbsenceProof {
  /** What the tree is, named for the failure message (`"the mentee's /home"`). */
  tree: string;
  /** Nodes that must be present in the same snapshot. */
  provenBy: readonly NodeQuery[];
}

/**
 * Node lines in both shapes agent-browser documents:
 *
 * - `- link "Users" [ref=e7]` — the Playwright-style tree the existing scenarios assert on
 *   (`heading "Dashboard"`, `cell "Ada Lovelace"`, `StaticText "Connected"`);
 * - `@e1 [heading] "Log in"` — the ref-prefixed form in the bundled `core` skill.
 *
 * Accepting both costs one optional group each and means a future CLI release changing the
 * rendering degrades into "no nodes parsed", which fails loudly, rather than into an absence
 * that passes because nothing matched.
 */
const NODE_LINE = /^(?:@e\d+\s+)?\[?([A-Za-z][A-Za-z0-9_-]*)\]?(?:\s+"((?:[^"\\]|\\.)*)")?/;

/** Header lines agent-browser prints above the tree; not nodes. */
const HEADER_LINE = /^(?:Page|URL):/;

function parseSnapshot(snapshot: string): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];

  for (const raw of snapshot.split('\n')) {
    const line = raw.trim();
    if (line === '' || HEADER_LINE.test(line)) {
      continue;
    }
    const match = NODE_LINE.exec(line.replace(/^-\s*/, ''));
    if (match === null) {
      continue;
    }
    nodes.push({
      role: match[1] ?? '',
      // The tree escapes quotes inside a name; unescape so the query is written the way the
      // name reads.
      name: (match[2] ?? '').replace(/\\(.)/g, '$1'),
      line,
    });
  }

  return nodes;
}

/**
 * A `RegExp` with `g`/`y` cleared.
 *
 * Those flags make `test` stateful through `lastIndex`, so the same pattern reused across
 * nodes would skip matches — an absence assertion that silently starts passing on the
 * second node it looks at. Callers should not have to know that.
 */
function stateless(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
}

function matchesName(name: string, text: string | RegExp): boolean {
  return typeof text === 'string'
    ? name.toLowerCase() === text.toLowerCase()
    : stateless(text).test(name);
}

function matches(node: SnapshotNode, query: NodeQuery): boolean {
  if (query.role !== undefined && node.role.toLowerCase() !== query.role.toLowerCase()) {
    return false;
  }
  return query.text === undefined || matchesName(node.name, query.text);
}

/** How a query reads in a failure message. */
function describe(query: NodeQuery): string {
  const role = query.role ?? 'any node';
  if (query.text === undefined) {
    return role;
  }
  return `${role} named ${typeof query.text === 'string' ? `"${query.text}"` : String(query.text)}`;
}

function preview(snapshot: string): string {
  const lines = snapshot.split('\n');
  const shown = lines.slice(0, PREVIEW_LINES).join('\n');
  return lines.length > PREVIEW_LINES
    ? `${shown}\n… ${lines.length - PREVIEW_LINES} more line(s)`
    : shown;
}

/**
 * Assert that a snapshot does **not** contain a node, having first proven the snapshot is
 * of a screen that actually rendered.
 *
 * ```ts
 * expectAbsent(
 *   snapshot,
 *   { role: 'link', text: /become a mentor/i },
 *   { tree: "the mentee's /home", provenBy: [{ role: 'link', text: 'My sessions' }] },
 * );
 * ```
 *
 * Throws — with the query, the control and a preview of the tree — when the node is there,
 * when the control is not, when the tree parsed to nothing, or when the query is empty.
 */
export function expectAbsent(
  snapshot: string,
  absent: NodeQuery,
  proof: AbsenceProof,
): void {
  if (absent.role === undefined && absent.text === undefined) {
    throw new Error(
      'expectAbsent needs a role, a text, or both: an empty query matches every node, so ' +
        'it can only ever fail, and a caller who meant "nothing at all" wants a different ' +
        'assertion.',
    );
  }
  if (proof.provenBy.length === 0) {
    throw new Error(
      `expectAbsent needs at least one positive control for ${proof.tree}. Absence in a ` +
        'tree nobody proved had loaded is not evidence of anything.',
    );
  }

  const nodes = parseSnapshot(snapshot);
  if (nodes.length === 0) {
    throw new Error(
      `No accessibility nodes were parsed from ${proof.tree}, so "${describe(absent)} is ` +
        'absent" proves nothing. The page failed to render, the snapshot was taken before ' +
        `it loaded, or agent-browser changed its tree format.\n\n${preview(snapshot)}`,
    );
  }

  const missing = proof.provenBy.filter((control) => !nodes.some((node) => matches(node, control)));
  if (missing.length > 0) {
    throw new Error(
      `The positive control for ${proof.tree} failed, so "${describe(absent)} is absent" ` +
        'proves nothing — this is not the screen the assertion is about. Expected but not ' +
        `found: ${missing.map(describe).join(', ')}.\n\n${preview(snapshot)}`,
    );
  }

  const found = nodes.filter((node) => matches(node, absent));
  if (found.length > 0) {
    throw new Error(
      `Expected no ${describe(absent)} in ${proof.tree}, but found ` +
        `${String(found.length)}:\n${found.map((node) => `  ${node.line}`).join('\n')}`,
    );
  }
}
