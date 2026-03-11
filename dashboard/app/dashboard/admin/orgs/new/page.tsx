"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function NewOrgPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [autoSlug, setAutoSlug] = useState(true)

  const handleNameChange = (value: string) => {
    setName(value)
    if (autoSlug) setSlug(slugify(value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const org = await api.platform.orgs.create({ name, slug })
      toast.success("Organization created")
      router.push(`/dashboard/admin/orgs/${org.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create organization"
      toast.error(message)
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
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
