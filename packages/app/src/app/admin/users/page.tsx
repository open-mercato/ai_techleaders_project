"use client";

import { useEffect, useState } from "react";
import { apiCall, DataTable, type Column } from "@devmentor/ui/backend";

/**
 * Reference concept page: fetches through `apiCall` (never a raw `fetch`) and renders
 * with `DataTable`, which owns the loading / error / empty states. Every later concept
 * list screen copies this shape.
 */
type UserRow = {
  id: string;
  email: string;
  displayName: string;
  mentorProfile: { id: string; headline: string } | null;
};

const columns: Column<UserRow>[] = [
  { key: "displayName", header: "Name" },
  { key: "email", header: "Email" },
  {
    key: "mentor",
    header: "Mentor profile",
    render: (row) => row.mentorProfile?.headline ?? "—",
  },
];

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiCall<UserRow[]>("/api/users").then((result) => {
      if (!active) return;
      if (result.ok) {
        setRows(result.data);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Fetched from <code>/api/users</code> (built with <code>makeCrudRoute</code>)
          and rendered with <code>DataTable</code>.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="No users yet — seed the database with npm run db:seed."
      />
    </div>
  );
}
