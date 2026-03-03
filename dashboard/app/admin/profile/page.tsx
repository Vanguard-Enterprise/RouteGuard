import { redirect } from 'next/navigation'
import { api, APIError } from '@/lib/api'
import { AdminProfileForm } from '@/components/admin/admin-profile-form'
import { AdminChangePasswordForm } from '@/components/admin/admin-change-password-form'
import { Separator } from '@/components/ui/separator'

export const metadata = {
  title: 'My Profile - RouteGuard',
}

async function getProfile() {
  try {
    return await api.admin.profile.get()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return null
  }
}

export default async function AdminProfilePage() {
  const user = await getProfile()
  if (!user) {
    redirect('/staff/login')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account details and password.</p>
      </div>
      <Separator />
      <AdminProfileForm user={user} />
      <AdminChangePasswordForm />
    </div>
  )
}
