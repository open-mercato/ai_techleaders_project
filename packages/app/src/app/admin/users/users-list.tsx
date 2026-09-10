"use client";

import { useEffect, useState } from "react";
import { apiCall, DataTable, type Column } from "@devmentor/ui/backend";

/**
 * Reference concept list: fetches through `apiCall` (never a raw `fetch`) and renders with
 * `DataTable`, which owns the loading / error / empty states. Every later concept list
 * screen copies this shape.
 *
 * It is a Client Component, and that is why it is a separate file from `page.tsx`. A page
 * that carries `'use client'` cannot `await` a guard, so the page above it stays a Server
 * Component: it enforces the operator role, renders the heading, and mounts this list.
 * `/api/users` requires the same role independently, so an unauthorized caller who reaches
 * this component anyway sees the envelope's error, not a row of anyone's data.
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

export function UsersList() {
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
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      loading={loading}
      error={error}
      emptyMessage="No users yet — seed the database with npm run db:seed."
    />
  );
}
