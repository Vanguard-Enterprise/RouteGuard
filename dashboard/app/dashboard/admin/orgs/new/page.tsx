"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function NewOrgPage() {
  const router = useRouter()
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
    setSubmitting(true)
    try {
      const org = await api.platform.orgs.create({ name, slug })

      // Set billing info for the new org
      await api.platform.orgs.updateBilling(org.id, {
        billing_status: billingStatus as "pilot" | "active" | "cancelled",
        billing_contact_email: billingContact,
        contract_notes: contractNotes,
      })

      toast.success("Organization created")
      router.push(`/dashboard/admin/orgs/${org.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create organization"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Create Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input id="name" value={name} onChange={(e) => handleNameChange(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setAutoSlug(false) }}
                required
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Billing</h3>
              <div className="space-y-2">
                <Label htmlFor="billingStatus">Billing Status</Label>
                <Select value={billingStatus} onValueChange={setBillingStatus}>
                  <SelectTrigger id="billingStatus">
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
                <Label htmlFor="billingContact">Billing Contact Email</Label>
                <Input
                  id="billingContact"
                  type="email"
                  value={billingContact}
                  onChange={(e) => setBillingContact(e.target.value)}
                  placeholder="billing@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractNotes">Contract Notes</Label>
                <Textarea
                  id="contractNotes"
                  value={contractNotes}
                  onChange={(e) => setContractNotes(e.target.value)}
                  placeholder="Optional notes about the contract"
                  rows={3}
                />
              </div>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
