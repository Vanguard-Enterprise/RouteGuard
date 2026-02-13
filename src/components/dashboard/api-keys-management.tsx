"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Copy, Check, Key } from "lucide-react";
import { toast } from "sonner";

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ApiKeysManagementProps {
  apiKeys: ApiKeyData[];
}

const AVAILABLE_PERMISSIONS = [
  { key: "routes:read", label: "Read Routes" },
  { key: "routes:write", label: "Write Routes" },
  { key: "students:read", label: "Read Students" },
  { key: "students:write", label: "Write Students" },
  { key: "vehicles:read", label: "Read Vehicles" },
  { key: "vehicles:write", label: "Write Vehicles" },
  { key: "trips:read", label: "Read Trips" },
  { key: "trips:write", label: "Write Trips" },
  { key: "schools:read", label: "Read Schools" },
  { key: "reports:read", label: "Read Reports" },
];

export function ApiKeysManagement({ apiKeys: initialKeys }: ApiKeysManagementProps) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // State for showing the newly created key
  const [newKeyDialog, setNewKeyDialog] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!keyName) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName,
          permissions: selectedPermissions,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create API key");
      }

      const data = await res.json();

      setKeys((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          keyPrefix: data.keyPrefix,
          permissions: data.permissions ?? "{}",
          lastUsedAt: null,
          expiresAt: data.expiresAt ?? null,
          createdAt: data.createdAt,
        },
      ]);

      // Close create dialog and show the key
      setCreateOpen(false);
      setKeyName("");
      setSelectedPermissions({});
      setNewKeyValue(data.key);
      setNewKeyDialog(true);
      setCopied(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to revoke API key");
      }

      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("API key revoked");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  function togglePermission(key: string) {
    setSelectedPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for programmatic access. The key will only be shown once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Key Name</Label>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., GPS Tracker Integration"
                />
              </div>
              <div className="space-y-3">
                <Label>Permissions</Label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_PERMISSIONS.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={!!selectedPermissions[perm.key]}
                        onCheckedChange={() => togglePermission(perm.key)}
                      />
                      {perm.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={submitting || !keyName}
              >
                {submitting ? "Creating..." : "Create Key"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Show new key dialog */}
      <Dialog open={newKeyDialog} onOpenChange={setNewKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy your API key now. You will not be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
              <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
              <code className="flex-1 break-all text-sm">{newKeyValue}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
              Make sure to copy your API key now. You will not be able to see it again.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key Prefix</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No API keys found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                      {k.keyPrefix}...
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(k.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(k.createdAt)}
                  </TableCell>
                  <TableCell>
                    {k.expiresAt ? (
                      <Badge
                        variant={
                          new Date(k.expiresAt) < new Date() ? "destructive" : "outline"
                        }
                      >
                        {formatDate(k.expiresAt)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      onClick={() => handleRevoke(k.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
