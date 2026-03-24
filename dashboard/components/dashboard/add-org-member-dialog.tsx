"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Copy, LoaderCircle, Mail, Sparkles, UserPlus } from "lucide-react"

import { api, type PlatformCreatedUser, type PlatformUser } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import useSWR from "swr"

type DeliveryMethod = "email" | "magic_link" | "password"

interface AddOrgMemberDialogProps {
  orgId: string
  orgName: string
  existingMemberIds: string[]
  onMemberAdded: () => Promise<unknown> | unknown
}

interface SuccessState {
  deliveryMethod: DeliveryMethod
  user: PlatformCreatedUser
  magicLinkUrl?: string | null
}

function buildInviteEmail(orgName: string, recipientName: string, recipientEmail: string, magicLinkUrl: string) {
  const subject = encodeURIComponent(`Access to ${orgName} in RouteGuard`)
  const body = encodeURIComponent(
    `Hi ${recipientName},\n\n` +
      `You have been added to ${orgName} in RouteGuard.\n\n` +
      `Use this secure sign-in link to access the organization:\n${magicLinkUrl}\n\n` +
      `If the link expires, contact your administrator for a new one.\n`
  )

  return `mailto:${encodeURIComponent(recipientEmail)}?subject=${subject}&body=${body}`
}

export function AddOrgMemberDialog({
  orgId,
  orgName,
  existingMemberIds,
  onMemberAdded,
}: AddOrgMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("email")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)
  const [successState, setSuccessState] = useState<SuccessState | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  const { data: usersData, isLoading: usersLoading, mutate: mutateUsers } = useSWR(
    open ? ["platform-users-for-org", debouncedSearch] : null,
    () => api.platform.users.list({ email: debouncedSearch || undefined, per_page: 6 })
  )

  const normalizedEmail = email.trim().toLowerCase()
  const { data: exactUserData } = useSWR(
    open && normalizedEmail
      ? ["platform-user-exact", normalizedEmail]
      : null,
    () => api.platform.users.list({ email: normalizedEmail, per_page: 5 })
  )

  const users = usersData?.items ?? []
  const exactUserMatch = useMemo(
    () => (exactUserData?.items ?? []).find((user) => user.email.toLowerCase() === normalizedEmail),
    [exactUserData?.items, normalizedEmail]
  )
  const exactUserAlreadyMember = !!(exactUserMatch && existingMemberIds.includes(exactUserMatch.id))

  function resetState() {
    setSearch("")
    setDebouncedSearch("")
    setName("")
    setEmail("")
    setDeliveryMethod("email")
    setPassword("")
    setConfirmPassword("")
    setSubmitting(false)
    setAddingUserId(null)
    setSuccessState(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  async function refreshMembersAndUsers() {
    await Promise.all([Promise.resolve(onMemberAdded()), mutateUsers()])
  }

  async function handleAddExisting(user: PlatformUser) {
    setAddingUserId(user.id)
    try {
      await api.platform.orgs.addMember(orgId, user.id)
      await refreshMembersAndUsers()
      toast.success("Member added")
      handleOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add member"
      toast.error(message)
    } finally {
      setAddingUserId(null)
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !normalizedEmail) return
    if (deliveryMethod === "password") {
      if (!password || password.length < 8) {
        toast.error("Password must be at least 8 characters")
        return
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match")
        return
      }
    }

    if (exactUserMatch) {
      if (exactUserAlreadyMember) {
        toast.error("That user is already a member of this organization")
      } else {
        toast.error("That email already belongs to an existing user. Add them from the list above.")
      }
      return
    }

    setSubmitting(true)
    try {
      const createdUser = await api.platform.users.create({
        email: normalizedEmail,
        name: name.trim(),
        org_id: orgId,
        delivery_method: deliveryMethod,
        initial_password: deliveryMethod === "password" ? password : undefined,
      })

      await refreshMembersAndUsers()

      if (deliveryMethod === "password") {
        toast.success("User created and added to organization")
        handleOpenChange(false)
        return
      }

      setSuccessState({
        deliveryMethod,
        user: createdUser,
        magicLinkUrl: createdUser.magic_link_url,
      })
      toast.success("User created and added to organization")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create user"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyMagicLink() {
    if (!successState?.magicLinkUrl) return
    try {
      await navigator.clipboard.writeText(successState.magicLinkUrl)
      toast.success("Magic link copied")
    } catch {
      toast.error("Failed to copy magic link")
    }
  }

  function openEmailDraft() {
    if (!successState?.magicLinkUrl) return
    window.location.href = buildInviteEmail(
      orgName,
      successState.user.name || successState.user.email,
      successState.user.email,
      successState.magicLinkUrl
    )
  }

  const submitLabel =
    deliveryMethod === "password"
      ? "Create user"
      : deliveryMethod === "email"
        ? "Create and draft email"
        : "Create magic link"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" />
          Add Member
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl">
        <div className="border-b px-6 py-5 sm:px-8">
          <DialogHeader className="gap-2">
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Add an existing user or create a new account for {orgName}.
            </DialogDescription>
          </DialogHeader>
        </div>

        {successState ? (
          <div className="space-y-6 px-6 py-6 sm:px-8">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium">Member added</h3>
                <p className="text-sm text-muted-foreground">
                  {successState.user.name} has been added to {orgName}.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">
                {successState.deliveryMethod === "email" ? "Delivery" : "Magic link"}
              </h4>
              <Textarea
                value={successState.magicLinkUrl ?? ""}
                readOnly
                rows={4}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                {successState.deliveryMethod === "email" ? (
                  <Button onClick={openEmailDraft}>
                    <Mail className="size-4" />
                    Open Email Draft
                  </Button>
                ) : null}
                <Button variant="outline" onClick={copyMagicLink}>
                  <Copy className="size-4" />
                  Copy Link
                </Button>
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 rounded-b-none border-t bg-transparent px-0 pt-4">
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6 px-6 py-6 sm:px-8">
            <section className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Existing users</h3>
                <p className="text-sm text-muted-foreground">
                  Search by exact email or use a recent user from the list.
                </p>
              </div>

              <Input
                placeholder="Search existing user by email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="rounded-md border">
                <Table>
                  <TableBody>
                    {usersLoading ? (
                      <TableRow>
                        <TableCell className="py-8 text-center text-muted-foreground">
                          Loading users...
                        </TableCell>
                      </TableRow>
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell className="py-8 text-center text-muted-foreground">
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => {
                        const alreadyMember = existingMemberIds.includes(user.id)
                        const disabled = !!user.disabled_at
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </TableCell>
                            <TableCell className="w-[180px] text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={alreadyMember || disabled || addingUserId === user.id}
                                onClick={() => handleAddExisting(user)}
                              >
                                {addingUserId === user.id ? (
                                  <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Adding...
                                  </>
                                ) : disabled ? (
                                  "Disabled user"
                                ) : alreadyMember ? (
                                  "Already added"
                                ) : (
                                  "Add user"
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            <Separator />

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Create a new user</h3>
                <p className="text-sm text-muted-foreground">
                  Choose how the new user will access the organization.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="member-name">Name</Label>
                  <Input
                    id="member-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Taylor Driver"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-email">Email</Label>
                  <Input
                    id="member-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="taylor@example.com"
                    required
                  />
                </div>
              </div>

              {exactUserMatch ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Existing user found</p>
                      <p className="text-sm text-muted-foreground">
                        {exactUserMatch.name} already has an account with this email.
                      </p>
                    </div>
                    {!exactUserAlreadyMember ? (
                      <Button type="button" size="sm" onClick={() => handleAddExisting(exactUserMatch)}>
                        Add Existing User
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">Already a member</span>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="delivery-method">Onboarding</Label>
                <Select value={deliveryMethod} onValueChange={(value: DeliveryMethod) => setDeliveryMethod(value)}>
                  <SelectTrigger id="delivery-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Send email</SelectItem>
                    <SelectItem value="magic_link">Magic link</SelectItem>
                    <SelectItem value="password">Set password</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {deliveryMethod === "email"
                    ? "Creates the user and prepares an email draft with a secure sign-in link."
                    : deliveryMethod === "magic_link"
                      ? "Creates a one-time sign-in link you can copy and share."
                      : "Creates the user with an initial password they can use right away."}
                </p>
              </div>

              {deliveryMethod === "password" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="initial-password">Initial Password</Label>
                    <Input
                      id="initial-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      required
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 size-4 text-primary" />
                  <p>
                    If the email already belongs to an existing account, add that user from the existing users list instead of creating a duplicate.
                  </p>
                </div>
              </div>

              <DialogFooter className="mx-0 mb-0 rounded-b-none border-t bg-transparent px-0 pt-4">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !name.trim() || !normalizedEmail || !!exactUserMatch}>
                  {submitting ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Working...
                    </>
                  ) : (
                    submitLabel
                  )}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
