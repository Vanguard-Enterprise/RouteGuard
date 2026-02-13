"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { SsoConnectionForm } from "./sso-connection-form";
import type { SsoConnection } from "@/db/schema";

interface SsoConnectionsCardProps {
  orgId: string;
}

export function SsoConnectionsCard({ orgId }: SsoConnectionsCardProps) {
  const [connections, setConnections] = useState<SsoConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<SsoConnection | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/sso`);
      if (res.ok) {
        setConnections(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  function handleAdd() {
    setEditingConnection(undefined);
    setFormOpen(true);
  }

  function handleEdit(conn: SsoConnection) {
    setEditingConnection(conn);
    setFormOpen(true);
  }

  async function handleDelete(connId: string) {
    if (!confirm("Are you sure you want to delete this SSO connection?")) return;
    setDeleting(connId);
    try {
      await fetch(`/api/admin/organizations/${orgId}/sso/${connId}`, {
        method: "DELETE",
      });
      await fetchConnections();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            SSO Connections
          </CardTitle>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Connection
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SSO connections configured. Add one to enable SSO login for this organization.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((conn) => (
                  <TableRow key={conn.id}>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {conn.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {conn.displayName}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {conn.domain}
                    </TableCell>
                    <TableCell>
                      <Badge variant={conn.enabled ? "default" : "secondary"}>
                        {conn.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(conn)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleting === conn.id}
                          onClick={() => handleDelete(conn.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SsoConnectionForm
        orgId={orgId}
        connection={editingConnection}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchConnections}
      />
    </>
  );
}
