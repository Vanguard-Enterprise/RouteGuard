"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { DemoResetStatus, Organization, OrgMember } from "@/lib/api"
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
  const { data: demoResetStatus, mutate: mutateDemoResetStatus } = useSWR<DemoResetStatus>(
    id ? ["platform-org-demo-reset", id] : null,
    () => api.platform.orgs.demoResetStatus(id)
  )

  const [editName, setEditName] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resettingDemo, setResettingDemo] = useState(false)

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
    if (org.is_demo) {
      toast.error("The protected demo org cannot be edited")
      return
    }
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
    if (org.is_demo) {
      toast.error("The protected demo org cannot be suspended")
      return
    }
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
    if (org.is_demo) {
      toast.error("The protected demo org cannot be deleted")
      return
    }
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

  async function handleResetDemo() {
    if (!org || !org.is_demo) return
    const confirmed = window.confirm(
      `Reset "${org.name}" back to the curated demo baseline? All current org data changes will be replaced.`
    )
    if (!confirmed) return

    setResettingDemo(true)
    try {
      await api.platform.orgs.resetDemo(org.id, { reset_mode: "full" })
      toast.success("Demo org reset completed")
      await Promise.all([mutate(), mutateMembers(), mutateDemoResetStatus()])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset demo org"
      toast.error(message)
      await mutateDemoResetStatus()
    } finally {
      setResettingDemo(false)
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
        <div className="flex items-center gap-2">
          {org.is_demo ? <Badge variant="secondary">Protected Demo</Badge> : null}
          {org.suspended_at ? (
            <Badge variant="destructive">Suspended</Badge>
          ) : (
            <Badge variant="default">Active</Badge>
          )}
        </div>
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
                  <p className="text-muted-foreground">Mode</p>
                  <p className="font-medium">
                    {org.is_demo ? "Protected demo org" : "Standard organization"}
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
                disabled={org.is_demo}
              >
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {org.is_demo ? (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader>
            <CardTitle>Demo Reset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This production org is protected and can be reset to the curated fake county baseline.
            </p>
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div>
                <p className="text-muted-foreground">Template Version</p>
                <p className="font-medium">{demoResetStatus?.template_version ?? org.demo_template_version ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Org Reset</p>
                <p className="font-medium">
                  {org.demo_last_reset_at ? new Date(org.demo_last_reset_at).toLocaleString() : "Never"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Latest Run Status</p>
                <p className="font-medium">{demoResetStatus?.latest_run?.status ?? "No runs yet"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Latest Run Actor</p>
                <p className="font-medium">{demoResetStatus?.latest_run?.started_by_email ?? "-"}</p>
              </div>
            </div>
            {demoResetStatus?.latest_run?.last_error ? (
              <div className="rounded-md border border-destructive/40 bg-background p-3 text-sm text-destructive">
                {demoResetStatus.latest_run.last_error}
              </div>
            ) : null}
            <Button onClick={handleResetDemo} disabled={resettingDemo}>
              {resettingDemo ? "Resetting..." : "Reset Demo Org"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
                {org.is_demo
                  ? "Protected demo org actions are locked here. Use the reset flow above to restore the baseline."
                  : org.suspended_at
                  ? "Restore access for this organization."
                  : "Temporarily disable access for this organization."}
              </p>
            </div>
            {org.suspended_at ? (
              <Button variant="outline" onClick={handleReactivate} disabled={org.is_demo}>
                Reactivate
              </Button>
            ) : (
              <Button variant="outline" onClick={handleSuspend} disabled={org.is_demo}>
                Suspend
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-destructive p-4">
            <div>
              <p className="font-medium">Delete organization</p>
              <p className="text-sm text-muted-foreground">
                {org.is_demo
                  ? "Protected demo orgs cannot be deleted."
                  : "Permanently remove this organization and all its data. This"} 
                {!org.is_demo ? " cannot be undone." : null}
              </p>
            </div>
            <Button variant="destructive" onClick={handleDelete} disabled={org.is_demo}>
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
