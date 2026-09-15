import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devmentor/ui";
import { checkDbConnection, getEnv, type BookingMetrics } from "@devmentor/core";
import { requirePageRole, withPageScope } from "../../lib/session";
import { RunPayouts } from "./run-payouts";
import { METRICS_WINDOW_DAYS, SessionMetrics } from "./session-metrics";

// Touches the DB — keep it out of the static prerender.
export const dynamic = "force-dynamic";

/**
 * The operator dashboard. It guards itself rather than relying on `admin/layout.tsx`: the
 * layout does not re-run on a client-side navigation back from `/admin/users`, and a
 * founder removed from `OPERATOR_EMAILS` mid-session must lose this screen on their next
 * navigation, not when their cookie expires.
 */
export default async function AdminDashboard() {
  await requirePageRole("operator", "/admin");

  const env = getEnv();
  const db = await checkDbConnection();
  // Read in the operator's own scope: `metricsSince` checks the role itself, so the page
  // cannot show a number to somebody the service would have refused.
  const metrics: BookingMetrics = await withPageScope(
    ({ bookingService }) => bookingService.metricsForLastDays(METRICS_WINDOW_DAYS),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of the {env.APP_NAME} instance.
        </p>
      </div>
      <SessionMetrics metrics={metrics} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>Runtime configuration</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{env.NODE_ENV}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payouts</CardTitle>
            <CardDescription>
              Pay mentors for sessions that have finished. Safe to run twice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RunPayouts />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
            <CardDescription>Connection status</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {db.ok ? (
              <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
            ) : (
              <span className="text-destructive">Unavailable</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
