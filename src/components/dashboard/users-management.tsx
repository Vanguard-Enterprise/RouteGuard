"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UsersManagementProps {
  users: UserData[];
  currentUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  org_admin: "Org Admin",
  school_admin: "School Admin",
  driver: "Driver",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  super_admin: "destructive",
  org_admin: "default",
  school_admin: "secondary",
  driver: "outline",
};

export function UsersManagement({ users: initialUsers, currentUserId }: UsersManagementProps) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("school_admin");
  const [submitting, setSubmitting] = useState(false);

  async function handleInvite() {
    if (!inviteEmail || !inviteName) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to invite user");
      }

      const newUser = await res.json();
      setUsers((prev) => [
        ...prev,
        {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          lastLoginAt: null,
          createdAt: newUser.createdAt,
        },
      ]);

      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("school_admin");
      toast.success("User invited successfully");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update role");
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast.success("User role updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to remove this user? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to remove user");
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("User removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    }
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
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Add a new user to your organization. They will receive access based on their assigned role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Name</Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_admin">Org Admin</SelectItem>
                    <SelectItem value="school_admin">School Admin</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setInviteOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInvite}
                disabled={submitting || !inviteEmail || !inviteName}
              >
                {submitting ? "Inviting..." : "Invite User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_VARIANTS[u.role] ?? "outline"}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(u.lastLoginAt)}
                  </TableCell>
                  <TableCell>
                    {u.id !== currentUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRoleChange(u.id, "org_admin")}>
                            <UserCog className="mr-2 h-4 w-4" />
                            Set as Org Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRoleChange(u.id, "school_admin")}>
                            <UserCog className="mr-2 h-4 w-4" />
                            Set as School Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRoleChange(u.id, "driver")}>
                            <UserCog className="mr-2 h-4 w-4" />
                            Set as Driver
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDelete(u.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
