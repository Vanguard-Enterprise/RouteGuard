'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { api, APIError, type User } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  avatar_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
})

type FormValues = z.infer<typeof schema>

interface AdminProfileFormProps {
  user: User
}

export function AdminProfileForm({ user }: AdminProfileFormProps) {
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(user.avatar_url ?? '')

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      avatar_url: user.avatar_url ?? '',
    },
  })

  const avatarUrlValue = watch('avatar_url')

  async function onSubmit(data: FormValues) {
    setLoading(true)
    try {
      await api.admin.profile.update({
        name: data.name,
        avatar_url: data.avatar_url || null,
      })
      setPreviewUrl(data.avatar_url || '')
      toast.success('Profile updated.')
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Something went wrong.'
      toast.error(msg)
    } finally {
      setLoading(false)
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
            <Avatar className="h-16 w-16 rounded-lg">
              <AvatarImage src={avatarUrlValue || previewUrl} alt={user.name} />
              <AvatarFallback className="rounded-lg text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">{user.email}</p>
              <p>Staff account</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" {...register('name')} placeholder="Your name" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar_url">Avatar URL</Label>
            <Input
              id="avatar_url"
              {...register('avatar_url')}
              placeholder="https://example.com/avatar.png"
              type="url"
            />
            {errors.avatar_url && (
              <p className="text-sm text-destructive">{errors.avatar_url.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Paste any public image URL. Leave blank to use initials.
            </p>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
