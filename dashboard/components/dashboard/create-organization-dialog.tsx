"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconBuildingPlus,
  IconHash,
  IconInfoCircle,
} from "@tabler/icons-react"
import { LoaderCircle } from "lucide-react"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
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
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function CreateOrganizationForm({
  onSuccess,
  isTransitioning = false,
}: {
  onSuccess: (orgId: string) => Promise<void> | void
  isTransitioning?: boolean
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [autoSlug, setAutoSlug] = useState(true)
  const [billingStatus, setBillingStatus] = useState("pilot")
  const [billingContact, setBillingContact] = useState("")
  const [contractNotes, setContractNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleNameChange = (value: string) => {
    setName(value)
    if (autoSlug) setSlug(slugify(value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isTransitioning) return
    setSubmitting(true)

    try {
      const org = await api.platform.orgs.create({ name, slug })

      await api.platform.orgs.updateBilling(org.id, {
        billing_status: billingStatus as "pilot" | "active" | "cancelled",
        billing_contact_email: billingContact,
        contract_notes: contractNotes,
      })

      toast.success("Organization created")
      await onSuccess(org.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create organization"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {isTransitioning ? (
        <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center sm:px-8">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/8 text-primary">
            <LoaderCircle className="size-7 animate-spin" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Opening organization</h3>
            <p className="text-sm text-muted-foreground">
              Finalizing setup and loading the new org details.
            </p>
          </div>
        </div>
      ) : (
        <>
      <div className="grid gap-6 px-6 pb-6 sm:px-8 sm:pb-8">
        <section className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="create-org-name">Organization Name</Label>
            <Input
              id="create-org-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Northstar Transit"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="create-org-slug">Slug</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Slug help"
                    >
                      <IconInfoCircle className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    Stable identifier used in admin URLs. It auto-fills from the name until you edit it.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="relative">
              <IconHash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="create-org-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setAutoSlug(false)
                }}
                className="pl-9"
                placeholder="northstar-transit"
                required
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Billing</h3>
            <p className="text-sm text-muted-foreground">
              Optional setup for the org&apos;s starting billing state.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="create-org-billing-status">Billing Status</Label>
              <Select value={billingStatus} onValueChange={setBillingStatus}>
                <SelectTrigger id="create-org-billing-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pilot">Pilot</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-org-billing-contact">Billing Contact Email</Label>
              <Input
                id="create-org-billing-contact"
                type="email"
                value={billingContact}
                onChange={(e) => setBillingContact(e.target.value)}
                placeholder="billing@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-org-contract-notes">Contract Notes</Label>
            <Textarea
              id="create-org-contract-notes"
              value={contractNotes}
              onChange={(e) => setContractNotes(e.target.value)}
              placeholder="Optional notes about pricing or contract terms"
              rows={4}
            />
          </div>
        </section>
      </div>

      <DialogFooter className="mx-0 mb-0 mt-auto rounded-b-[1.5rem] border-t border-border/70 bg-background/95 px-6 py-4 backdrop-blur sm:px-8">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={submitting || isTransitioning}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" size="lg" disabled={submitting || isTransitioning || !name.trim() || !slug.trim()}>
          {submitting ? "Creating..." : "Create Organization"}
        </Button>
      </DialogFooter>
        </>
      )}
    </form>
  )
}

export function CreateOrganizationDialog({
  onCreated,
}: {
  onCreated?: () => Promise<unknown> | unknown
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isTransitioning) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setResetKey((current) => current + 1)
      setIsTransitioning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" className="shadow-sm shadow-black/10">
          <IconBuildingPlus className="size-4" />
          Create Organization
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-hidden border border-border/70 bg-background p-0 shadow-2xl shadow-black/15 sm:max-w-4xl">
        <div className="border-b border-border/70 bg-muted/20 px-6 py-6 sm:px-8">
          <DialogHeader className="max-w-xl gap-2">
            <DialogTitle className="text-2xl font-semibold tracking-tight sm:text-[2rem]">
              Create a new organization
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Add the org details below. Billing fields are optional.
            </DialogDescription>
          </DialogHeader>
        </div>

        <CreateOrganizationForm
          key={resetKey}
          isTransitioning={isTransitioning}
          onSuccess={async (orgId) => {
            setIsTransitioning(true)
            await onCreated?.()
            router.prefetch(`/dashboard/admin/orgs/${orgId}`)
            router.refresh()
            await new Promise((resolve) => setTimeout(resolve, 450))
            router.push(`/dashboard/admin/orgs/${orgId}`)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
