"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type {
  Organization,
  OrgMember,
  OrgRole,
  OrgBilling,
  SSOConnection,
  Integration,
  PlatformUser,
  PageResponse,
} from "@/lib/api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// General Tab
// ---------------------------------------------------------------------------
function GeneralTab() {
  const { data: org, mutate } = useSWR<Organization>("org-settings", () =>
    api.org.settings.get()
  )
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  function startEdit() {
    if (!org) return
    setName(org.name)
    setEditMode(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.org.settings.update({ name })
      toast.success("Organization updated")
      setEditMode(false)
      mutate()
    } catch {
      toast.error("Failed to update organization")
    } finally {
      setSaving(false)
    }
  }

  if (!org) return <div className="text-muted-foreground">Loading...</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editMode ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(false)}
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
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">
                  {new Date(org.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={startEdit}>
              Edit
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Members Tab
// ---------------------------------------------------------------------------
function MembersTab() {
  const { data: members, mutate: mutateMembers } = useSWR<OrgMember[]>(
    "org-members",
    () => api.org.members.list()
  )
  const { data: roles } = useSWR<OrgRole[]>("org-roles", () =>
    api.org.roles.list()
  )

  const [addMode, setAddMode] = useState(false)
  const [addEmail, setAddEmail] = useState("")
  const [searchResults, setSearchResults] = useState<PlatformUser[]>([])
  const [searching, setSearching] = useState(false)
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [creatingUser, setCreatingUser] = useState(false)
  const [editingRoles, setEditingRoles] = useState<string | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState("")

  const handleSearchUser = useCallback(async () => {
    if (!addEmail.trim()) return
    setSearching(true)
    try {
      const result: PageResponse<PlatformUser> =
        await api.platform.users.list({ email: addEmail.trim(), per_page: 5 })
      setSearchResults(result.items ?? [])
    } catch {
      toast.error("Failed to search users")
    } finally {
      setSearching(false)
    }
  }, [addEmail])

  async function handleInvite() {
    if (!addEmail.trim()) return
    try {
      await api.org.members.invite(addEmail.trim())
      toast.success("Member invited")
      setAddMode(false)
      setAddEmail("")
      setSearchResults([])
      mutateMembers()
    } catch {
      toast.error("Failed to invite member")
    }
  }

  async function handleCreateAndAdd() {
    if (!newUserEmail.trim() || !newUserName.trim()) return
    setCreatingUser(true)
    try {
      await api.org.members.create({
        email: newUserEmail.trim(),
        name: newUserName.trim(),
      })
      toast.success("User created and added")
      setNewUserEmail("")
      setNewUserName("")
      setAddMode(false)
      mutateMembers()
    } catch {
      toast.error("Failed to create user")
    } finally {
      setCreatingUser(false)
    }
  }

  async function handleRemove(userId: string) {
    try {
      await api.org.members.remove(userId)
      toast.success("Member removed")
      mutateMembers()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove member"
      toast.error(message)
    }
  }

  async function handleUpdateRoles(userId: string) {
    if (!selectedRoleId) return
    try {
      await api.org.members.updateRoles(userId, [selectedRoleId])
      toast.success("Roles updated")
      setEditingRoles(null)
      setSelectedRoleId("")
      mutateMembers()
    } catch {
      toast.error("Failed to update roles")
    }
  }

  return (
    <div className="space-y-4">
      {addMode && (
        <Card>
          <CardHeader>
            <CardTitle>Add Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Search existing user by email
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="user@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
                  className="max-w-sm"
                />
                <Button
                  onClick={handleSearchUser}
                  disabled={searching}
                  variant="outline"
                  size="sm"
                >
                  {searching ? "Searching..." : "Search"}
                </Button>
                <Button onClick={handleInvite} size="sm">
                  Invite by Email
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableBody>
                      {searchResults.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            {u.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {u.email}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleInvite()}
                            >
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">Or create a new user</p>
              <div className="flex flex-wrap gap-2 items-end">
                <Input
                  placeholder="Name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="max-w-[200px]"
                />
                <Input
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="max-w-sm"
                />
                <Button
                  onClick={handleCreateAndAdd}
                  disabled={creatingUser || !newUserName || !newUserEmail}
                  size="sm"
                >
                  {creatingUser ? "Creating..." : "Create & Add"}
                </Button>
              </div>
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddMode(false)
                  setSearchResults([])
                  setAddEmail("")
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Members</CardTitle>
          {!addMode && (
            <Button size="sm" onClick={() => setAddMode(true)}>
              Add Member
            </Button>
          )}
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
                        {editingRoles === member.user_id ? (
                          <div className="flex gap-2 items-center">
                            <Select
                              value={selectedRoleId}
                              onValueChange={setSelectedRoleId}
                            >
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {(roles ?? []).map((role) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    {role.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateRoles(member.user_id)}
                              disabled={!selectedRoleId}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingRoles(null)
                                setSelectedRoleId("")
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer hover:underline"
                            onClick={() => {
                              setEditingRoles(member.user_id)
                              setSelectedRoleId(
                                member.roles?.[0]?.id ?? ""
                              )
                            }}
                          >
                            {member.roles?.map((r) => r.name).join(", ") ||
                              "-"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemove(member.user_id)}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// SSO Tab
// ---------------------------------------------------------------------------
function SSOTab() {
  const { data: connections, mutate } = useSWR<SSOConnection[]>(
    "org-sso",
    () => api.org.sso.list()
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [connType, setConnType] = useState<"saml" | "oidc">("oidc")
  const [displayName, setDisplayName] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState("")
  const [oidcClientId, setOidcClientId] = useState("")
  const [oidcClientSecret, setOidcClientSecret] = useState("")
  const [oidcScopes, setOidcScopes] = useState("")
  const [samlEntityId, setSamlEntityId] = useState("")
  const [samlSsoUrl, setSamlSsoUrl] = useState("")
  const [samlCertificate, setSamlCertificate] = useState("")
  const [samlMetadataUrl, setSamlMetadataUrl] = useState("")

  function resetForm() {
    setConnType("oidc")
    setDisplayName("")
    setEnabled(true)
    setOidcIssuerUrl("")
    setOidcClientId("")
    setOidcClientSecret("")
    setOidcScopes("")
    setSamlEntityId("")
    setSamlSsoUrl("")
    setSamlCertificate("")
    setSamlMetadataUrl("")
    setEditingId(null)
    setFormOpen(false)
  }

  function startEdit(conn: SSOConnection) {
    setEditingId(conn.id)
    setConnType(conn.type)
    setDisplayName(conn.display_name)
    setEnabled(conn.enabled)
    setOidcIssuerUrl(conn.oidc_issuer_url ?? "")
    setOidcClientId(conn.oidc_client_id ?? "")
    setOidcClientSecret("")
    setOidcScopes(conn.oidc_scopes ?? "")
    setSamlEntityId(conn.saml_entity_id ?? "")
    setSamlSsoUrl(conn.saml_sso_url ?? "")
    setSamlCertificate("")
    setSamlMetadataUrl(conn.saml_metadata_url ?? "")
    setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const data: Record<string, unknown> = {
        type: connType,
        display_name: displayName,
        enabled,
      }
      if (connType === "oidc") {
        data.oidc_issuer_url = oidcIssuerUrl || undefined
        data.oidc_client_id = oidcClientId || undefined
        data.oidc_scopes = oidcScopes || undefined
        if (oidcClientSecret) data.oidc_client_secret = oidcClientSecret
      } else {
        data.saml_entity_id = samlEntityId || undefined
        data.saml_sso_url = samlSsoUrl || undefined
        data.saml_metadata_url = samlMetadataUrl || undefined
        if (samlCertificate) data.saml_certificate = samlCertificate
      }

      if (editingId) {
        await api.org.sso.update(
          editingId,
          data as Parameters<typeof api.org.sso.update>[1]
        )
        toast.success("SSO connection updated")
      } else {
        await api.org.sso.create(
          data as Parameters<typeof api.org.sso.create>[0]
        )
        toast.success("SSO connection created")
      }
      resetForm()
      mutate()
    } catch {
      toast.error("Failed to save SSO connection")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this SSO connection?")) return
    try {
      await api.org.sso.delete(id)
      toast.success("SSO connection deleted")
      mutate()
    } catch {
      toast.error("Failed to delete SSO connection")
    }
  }

  async function handleToggle(conn: SSOConnection) {
    try {
      await api.org.sso.update(conn.id, { enabled: !conn.enabled })
      mutate()
    } catch {
      toast.error("Failed to update SSO connection")
    }
  }

  return (
    <div className="space-y-4">
      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit SSO Connection" : "New SSO Connection"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={connType}
                  onValueChange={(v) => setConnType(v as "saml" | "oidc")}
                  disabled={!!editingId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oidc">OIDC</SelectItem>
                    <SelectItem value="saml">SAML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>

            {connType === "oidc" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Issuer URL</label>
                  <Input
                    value={oidcIssuerUrl}
                    onChange={(e) => setOidcIssuerUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Client ID</label>
                  <Input
                    value={oidcClientId}
                    onChange={(e) => setOidcClientId(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Client Secret</label>
                  <Input
                    type="password"
                    value={oidcClientSecret}
                    onChange={(e) => setOidcClientSecret(e.target.value)}
                    placeholder={editingId ? "Leave blank to keep current" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Scopes</label>
                  <Input
                    value={oidcScopes}
                    onChange={(e) => setOidcScopes(e.target.value)}
                    placeholder="openid profile email"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Entity ID</label>
                    <Input
                      value={samlEntityId}
                      onChange={(e) => setSamlEntityId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">SSO URL</label>
                    <Input
                      value={samlSsoUrl}
                      onChange={(e) => setSamlSsoUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Metadata URL</label>
                    <Input
                      value={samlMetadataUrl}
                      onChange={(e) => setSamlMetadataUrl(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Certificate</label>
                  <Textarea
                    value={samlCertificate}
                    onChange={(e) => setSamlCertificate(e.target.value)}
                    placeholder={
                      editingId ? "Leave blank to keep current" : "Paste certificate PEM"
                    }
                    rows={4}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !displayName} size="sm">
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>SSO Connections</CardTitle>
          {!formOpen && (
            <Button
              size="sm"
              onClick={() => {
                resetForm()
                setFormOpen(true)
              }}
            >
              Add Connection
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!connections || connections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No SSO connections configured.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{conn.display_name}</span>
                      <Badge variant="secondary">
                        {conn.type.toUpperCase()}
                      </Badge>
                      <Badge
                        variant={conn.enabled ? "default" : "outline"}
                      >
                        {conn.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(conn.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggle(conn)}
                    >
                      {conn.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(conn)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(conn.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Billing Tab
// ---------------------------------------------------------------------------
function BillingTab() {
  const { data: billing, mutate } = useSWR<OrgBilling>("org-billing", () =>
    api.org.billing.get()
  )
  const [editContact, setEditContact] = useState(false)
  const [contactEmail, setContactEmail] = useState("")
  const [saving, setSaving] = useState(false)

  function startEditContact() {
    if (!billing) return
    setContactEmail(billing.billing_contact_email)
    setEditContact(true)
  }

  async function handleSaveContact() {
    setSaving(true)
    try {
      await api.org.billing.updateContact(contactEmail)
      toast.success("Billing contact updated")
      setEditContact(false)
      mutate()
    } catch {
      toast.error("Failed to update billing contact")
    } finally {
      setSaving(false)
    }
  }

  if (!billing) return <div className="text-muted-foreground">Loading...</div>

  const statusVariant =
    billing.billing_status === "active"
      ? "default"
      : billing.billing_status === "pilot"
        ? "secondary"
        : "destructive"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant={statusVariant as "default" | "secondary" | "destructive"}>
              {billing.billing_status}
            </Badge>
          </div>
          {billing.pilot_ends_at && (
            <div>
              <p className="text-muted-foreground">Pilot Ends</p>
              <p className="font-medium">
                {new Date(billing.pilot_ends_at).toLocaleDateString()}
              </p>
            </div>
          )}
          {billing.contract_notes && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Contract Notes</p>
              <p className="font-medium">{billing.contract_notes}</p>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-1">
            Billing Contact Email
          </p>
          {editContact ? (
            <div className="flex gap-2 items-center">
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="max-w-sm"
              />
              <Button
                onClick={handleSaveContact}
                disabled={saving}
                size="sm"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditContact(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <p className="font-medium">
                {billing.billing_contact_email || "-"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={startEditContact}
              >
                Edit
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Integrations Tab
// ---------------------------------------------------------------------------
function IntegrationsTab() {
  const { data: integrations, mutate } = useSWR<Integration[]>(
    "org-integrations",
    () => api.org.integrations.list()
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [intType, setIntType] = useState("powerschool")
  const [intDisplayName, setIntDisplayName] = useState("")
  const [intBaseUrl, setIntBaseUrl] = useState("")
  const [intApiKey, setIntApiKey] = useState("")
  const [intApiSecret, setIntApiSecret] = useState("")
  const [intEnabled, setIntEnabled] = useState(true)

  function resetForm() {
    setIntType("powerschool")
    setIntDisplayName("")
    setIntBaseUrl("")
    setIntApiKey("")
    setIntApiSecret("")
    setIntEnabled(true)
    setEditingId(null)
    setFormOpen(false)
  }

  function startEdit(intg: Integration) {
    setEditingId(intg.id)
    setIntType(intg.type)
    setIntDisplayName(intg.display_name)
    setIntBaseUrl(intg.base_url)
    setIntApiKey("")
    setIntApiSecret("")
    setIntEnabled(intg.enabled)
    setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (editingId) {
        await api.org.integrations.update(editingId, {
          type: intType,
          display_name: intDisplayName,
          base_url: intBaseUrl,
          api_key: intApiKey || undefined,
          api_secret: intApiSecret || undefined,
          enabled: intEnabled,
        })
        toast.success("Integration updated")
      } else {
        await api.org.integrations.create({
          type: intType,
          display_name: intDisplayName,
          base_url: intBaseUrl,
          api_key: intApiKey || undefined,
          api_secret: intApiSecret || undefined,
          enabled: intEnabled,
        })
        toast.success("Integration created")
      }
      resetForm()
      mutate()
    } catch {
      toast.error("Failed to save integration")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this integration?")) return
    try {
      await api.org.integrations.delete(id)
      toast.success("Integration deleted")
      mutate()
    } catch {
      toast.error("Failed to delete integration")
    }
  }

  return (
    <div className="space-y-4">
      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Integration" : "New Integration"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={intType}
                  onValueChange={setIntType}
                  disabled={!!editingId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="powerschool">PowerSchool</SelectItem>
                    <SelectItem value="clever">Clever</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  value={intDisplayName}
                  onChange={(e) => setIntDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">Base URL</label>
                <Input
                  value={intBaseUrl}
                  onChange={(e) => setIntBaseUrl(e.target.value)}
                  placeholder="https://powerschool.district.org"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  value={intApiKey}
                  onChange={(e) => setIntApiKey(e.target.value)}
                  placeholder={editingId ? "Leave blank to keep current" : ""}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">API Secret</label>
                <Input
                  type="password"
                  value={intApiSecret}
                  onChange={(e) => setIntApiSecret(e.target.value)}
                  placeholder={editingId ? "Leave blank to keep current" : ""}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving || !intDisplayName || !intBaseUrl}
                size="sm"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Integrations</CardTitle>
          {!formOpen && (
            <Button
              size="sm"
              onClick={() => {
                resetForm()
                setFormOpen(true)
              }}
            >
              Add Integration
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!integrations || integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No integrations configured.
            </p>
          ) : (
            <div className="space-y-3">
              {integrations.map((intg) => (
                <div
                  key={intg.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{intg.display_name}</span>
                      <Badge variant="secondary">{intg.type}</Badge>
                      <Badge variant={intg.enabled ? "default" : "outline"}>
                        {intg.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {intg.base_url}
                    </p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>
                        Credentials:{" "}
                        {intg.has_api_key || intg.has_api_secret
                          ? "Configured"
                          : "Not configured"}
                      </span>
                      <span>
                        Last synced:{" "}
                        {intg.last_synced_at
                          ? new Date(intg.last_synced_at).toLocaleDateString()
                          : "Never"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(intg)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(intg.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="sso">SSO</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>

        <TabsContent value="sso" className="mt-4">
          <SSOTab />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
