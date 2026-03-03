'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'
import { api, APIError, type User } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
})

type FormValues = z.infer<typeof schema>

interface AdminProfileFormProps {
  user: User
}

export function AdminProfileForm({ user }: AdminProfileFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(user.avatar_url)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name },
  })

  async function onSubmit(data: FormValues) {
    setSaving(true)
    try {
      await api.admin.profile.update({ name: data.name })
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const prevSrc = avatarSrc
    const localURL = URL.createObjectURL(file)
    setAvatarSrc(localURL)
    setUploading(true)

    const uploadPromise = api.admin.profile.uploadAvatar(file)
    toast.promise(uploadPromise, {
      loading: 'Uploading avatar...',
      success: 'Avatar updated.',
      error: (err) => (err instanceof APIError ? err.message : 'Upload failed.'),
    })

    try {
      const updated = await uploadPromise
      setAvatarSrc(updated.avatar_url)
      router.refresh() // re-fetches the server layout so the sidebar avatar updates
    } catch {
      setAvatarSrc(prevSrc)
    } finally {
      setUploading(false)
      URL.revokeObjectURL(localURL)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your display name and avatar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="group relative h-16 w-16 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Upload profile picture"
            >
              <Avatar className="h-16 w-16 rounded-lg">
                <AvatarImage src={avatarSrc ?? undefined} alt={user.name || user.email} />
                <AvatarFallback className="rounded-lg text-lg">{initials}</AvatarFallback>
              </Avatar>
              {uploading ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="text-sm text-muted-foreground">
              <p className="font-medium">{user.email}</p>
              <p>Staff account</p>
              <p className="mt-1 text-xs">JPEG, PNG, WebP or GIF - max 5 MB</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" {...register('name')} placeholder="Your name" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <Button type="submit" disabled={saving || uploading}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
