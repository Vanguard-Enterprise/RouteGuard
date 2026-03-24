"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Organization, OrgMember } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AddOrgMemberDialog } from "@/components/dashboard/add-org-member-dialog"
import { toast } from "sonner"
import useSWR from "swr"

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const {
    data: org,
    error,
    isLoading,
    mutate,
  } = useSWR<Organization>(id ? ["platform-org", id] : null, () =>
    api.platform.orgs.get(id)
  )

  const { data: members, mutate: mutateMembers } = useSWR<OrgMember[]>(
    id ? ["platform-org-members", id] : null,
    () => api.platform.orgs.members(id) as Promise<OrgMember[]>
  )

  const [editName, setEditName] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)

  function startEdit(org: Organization) {
    setEditName(org.name)
    setEditSlug(org.slug)
    setEditMode(true)
  }

  function cancelEdit() {
    setEditMode(false)
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    try {
      await api.platform.orgs.update(org.id, { name: editName, slug: editSlug })
      toast.success("Organization updated")
      setEditMode(false)
      mutate()
    } catch {
      toast.error("Failed to update organization")
    } finally {
      setSaving(false)
    }
  }

  async function handleSuspend() {
    if (!org) return
    try {
      await api.platform.orgs.suspend(org.id)
      toast.success("Organization suspended")
      mutate()
    } catch {
      toast.error("Failed to suspend organization")
    }
  }

  async function handleReactivate() {
    if (!org) return
    try {
      await api.platform.orgs.reactivate(org.id)
      toast.success("Organization reactivated")
      mutate()
    } catch {
      toast.error("Failed to reactivate organization")
    }
  }

  async function handleDelete() {
    if (!org) return
    const confirmed = window.confirm(
      `Are you sure you want to delete "${org.name}"? This action cannot be undone.`
    )
    if (!confirmed) return
    try {
      await api.platform.orgs.delete(org.id)
      toast.success("Organization deleted")
      router.push("/dashboard/admin/orgs")
    } catch {
      toast.error("Failed to delete organization")
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!org) return
    try {
      await api.platform.orgs.removeMember(org.id, userId)
      toast.success("Member removed")
      mutateMembers()
    } catch {
      toast.error("Failed to remove member")
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground">Loading organization...</div>
    )
  }

  if (error || !org) {
    return (
      <div className="p-6 text-destructive">Failed to load organization.</div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <p className="text-muted-foreground text-sm">{org.slug}</p>
        </div>
        {org.suspended_at ? (
          <Badge variant="destructive">Suspended</Badge>
        ) : (
          <Badge variant="default">Active</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {editMode ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{org.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Slug</p>
                  <p className="font-medium">{org.slug}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">
                    {org.suspended_at ? "Suspended" : "Active"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(org.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p className="font-medium">
                    {new Date(org.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEdit(org)}
              >
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Members</CardTitle>
          <AddOrgMemberDialog
            orgId={org.id}
            orgName={org.name}
            existingMemberIds={(members ?? []).map((member) => member.user_id)}
            onMemberAdded={() => mutateMembers()}
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!members || members.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No members found.
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => (
                    <TableRow key={member.user_id}>
                      <TableCell className="font-medium">
                        {member.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell>
                        {member.roles
                          ?.map((r) => r.name)
                          .join(", ") || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleRemoveMember(member.user_id)
                          }
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">
                {org.suspended_at
                  ? "Reactivate organization"
                  : "Suspend organization"}
              </p>
              <p className="text-sm text-muted-foreground">
                {org.suspended_at
                  ? "Restore access for this organization."
                  : "Temporarily disable access for this organization."}
              </p>
            </div>
            {org.suspended_at ? (
              <Button variant="outline" onClick={handleReactivate}>
                Reactivate
              </Button>
            ) : (
              <Button variant="outline" onClick={handleSuspend}>
                Suspend
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-destructive p-4">
            <div>
              <p className="font-medium">Delete organization</p>
              <p className="text-sm text-muted-foreground">
                Permanently remove this organization and all its data. This
                cannot be undone.
              </p>
            </div>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
