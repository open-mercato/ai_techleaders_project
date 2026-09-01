import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const AGENT_BROWSER = fileURLToPath(
  new URL("../../node_modules/.bin/agent-browser", import.meta.url),
);
const SCREENSHOT_DIR = fileURLToPath(
  new URL("../../test-results/", import.meta.url),
);

/** The envelope every `--json` invocation prints on stdout. */
type Envelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type FindStrategy =
  | "role"
  | "text"
  | "label"
  | "placeholder"
  | "testid"
  | "first"
  | "last";

/**
 * Thin typed wrapper over the agent-browser CLI.
 *
 * agent-browser is a CLI, not a library, so every call shells out. The browser
 * itself lives in a background daemon keyed by `--session`, so state persists
 * across calls and each test file can hold an isolated session.
 */
export class AgentBrowser {
  constructor(
    private readonly session: string,
    private readonly baseUrl: string,
  ) {}

  /** Runs one command and returns its `data` payload. */
  async run<T = unknown>(
    args: string[],
    opts: { timeoutMs?: number } = {},
  ): Promise<T> {
    const argv = [...args, "--session", this.session, "--json"];

    const env = { ...process.env };
    if (opts.timeoutMs !== undefined) {
      // There is no per-command timeout flag (`--timeout` only applies to
      // `wait --download`); this env var is the documented override. Values
      // above 30s risk EAGAIN, because the CLI's IPC read timeout expires first.
      env.AGENT_BROWSER_DEFAULT_TIMEOUT = String(
        Math.min(opts.timeoutMs, 30_000),
      );
    }

    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(AGENT_BROWSER, argv, {
        // Snapshots of large pages can exceed the 1MB default.
        maxBuffer: 32 * 1024 * 1024,
        env,
      }));
    } catch (err: unknown) {
      // The CLI exits non-zero on failure but still prints the JSON envelope,
      // which carries a far better message than the exec error itself.
      const execErr = err as { stdout?: string; message?: string };
      const parsed = this.tryParse<T>(execErr.stdout);
      throw new Error(
        `agent-browser ${args.join(" ")} failed: ${
          parsed?.error ?? execErr.message ?? "unknown error"
        }`,
      );
    }

    const parsed = this.tryParse<T>(stdout);
    if (!parsed) {
      throw new Error(
        `agent-browser ${args.join(" ")} returned non-JSON output: ${stdout.slice(0, 500)}`,
      );
    }
    if (!parsed.success) {
      throw new Error(
        `agent-browser ${args.join(" ")} failed: ${parsed.error ?? "unknown error"}`,
      );
    }

    return (parsed.data ?? (parsed as unknown)) as T;
  }

  private tryParse<T>(raw: string | undefined): Envelope<T> | undefined {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Envelope<T>;
    } catch {
      return undefined;
    }
  }

  /** Navigates to a path relative to the app under test. */
  async open(path = "/"): Promise<void> {
    await this.run(["open", new URL(path, this.baseUrl).toString()]);
    await this.run(["wait", "--load", "networkidle"]);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.run(["fill", selector, value]);
  }

  async click(selector: string): Promise<void> {
    await this.run(["click", selector]);
  }

  /** Acts on an element located semantically, e.g. `find("testid", "message-input", "click")`. */
  async find(
    strategy: FindStrategy,
    query: string,
    action: "click" | "fill" | "check" | "hover" | "text",
    value?: string,
  ): Promise<unknown> {
    const args = ["find", strategy, query, action];
    if (value !== undefined) args.push(value);
    return this.run(args);
  }

  async text(selector: string): Promise<string> {
    const data = await this.run<string | { text?: string }>([
      "get",
      "text",
      selector,
    ]);
    if (typeof data === "string") return data;
    return data?.text ?? "";
  }

  async count(selector: string): Promise<number> {
    const data = await this.run<number | { count?: number }>([
      "get",
      "count",
      selector,
    ]);
    return typeof data === "number" ? data : (data?.count ?? 0);
  }

  async isVisible(selector: string): Promise<boolean> {
    const data = await this.run<boolean | { visible?: boolean; result?: boolean }>(
      ["is", "visible", selector],
    );
    if (typeof data === "boolean") return data;
    return data?.visible ?? data?.result ?? false;
  }

  async waitForText(text: string, timeoutMs = 15_000): Promise<void> {
    await this.run(["wait", "--text", text], { timeoutMs });
  }

  async waitForSelector(selector: string, timeoutMs = 15_000): Promise<void> {
    await this.run(["wait", selector], { timeoutMs });
  }

  /** Saves a screenshot under `test-results/`; used to capture CI failures. */
  async screenshot(name: string): Promise<void> {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const safe = name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 120);
    await this.run(["screenshot", `${SCREENSHOT_DIR}${safe}.png`, "--full"]);
  }

  async close(): Promise<void> {
    // Never let cleanup fail a passing test: if the daemon already went away,
    // there is nothing to release.
    try {
      await this.run(["close"]);
    } catch {
      // ignore
    }
  }
}
