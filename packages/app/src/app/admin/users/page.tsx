import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devmentor/ui";
import { withScope } from "@devmentor/core";
import type { IUser } from "@devmentor/db";

// Reads through the ORM — must run per-request, never prerendered.
export const dynamic = "force-dynamic";

async function loadUsers(): Promise<
  { ok: true; users: IUser[] } | { ok: false; error: string }
> {
  try {
    // Resolve the request-scoped UserService from the awilix container. It is
    // constructed with a forked EntityManager unique to this scope.
    const users = await withScope((cradle) => cradle.userService.list());
    return { ok: true, users };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function UsersPage() {
  const result = await loadUsers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Read through <code>UserService</code> via the DI container.
        </p>
      </div>

      {!result.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>Database unavailable</CardTitle>
            <CardDescription>
              The users list could not be loaded. Start Postgres with{" "}
              <code>npm run db:up</code> and run the migrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-destructive">{result.error}</CardContent>
        </Card>
      ) : result.users.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No users yet</CardTitle>
            <CardDescription>
              Seed the database with <code>npm run db:seed</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {result.users.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <CardTitle>{user.displayName}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </CardHeader>
              {user.mentorProfile ? (
                <CardContent className="text-sm text-muted-foreground">
                  {user.mentorProfile.headline}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
