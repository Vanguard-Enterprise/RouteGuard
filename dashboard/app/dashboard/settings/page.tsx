import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Users, Key, Shield, LogIn } from 'lucide-react'
import OrgSettingsForm from '@/components/dashboard/org-settings-form'

async function getUser() {
  try {
    return await api.auth.me()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return null
  }
}

export const metadata = {
  title: 'Settings — RouteGuard',
}

const settingCards = [
  {
    href: '/dashboard/settings/users',
    icon: Users,
    title: 'Users',
    description: 'Manage user accounts and role assignments.',
  },
  {
    href: '/dashboard/settings/api-keys',
    icon: Key,
    title: 'API Keys',
    description: 'Create and manage API keys for integrations.',
  },
  {
    href: '/dashboard/settings/sso',
    icon: LogIn,
    title: 'SSO',
    description: 'Configure SAML and OIDC single sign-on connections.',
  },
  {
    href: '/dashboard/settings/roles',
    icon: Shield,
    title: 'Roles',
    description: 'Define custom roles with granular permissions.',
  },
]

export default async function SettingsPage() {
  const user = await getUser()
  if (!user) return null

  const org = user.org_id
    ? await api.admin.organizations.get(user.org_id).catch(() => null)
    : null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Logged in as <strong>{user.email}</strong>
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={16} style={{ color: 'var(--color-brand-navy)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
            Organization
          </h2>
        </div>
        <OrgSettingsForm user={user} orgName={org?.name ?? null} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
          More Settings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {settingCards.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 hover:border-gray-200 hover:shadow-md transition-all group"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ backgroundColor: 'var(--color-brand-navy)' }}
              >
                <Icon size={18} className="text-white" />
              </div>
              <h3
                className="text-sm font-semibold mb-1 group-hover:underline"
                style={{ color: 'var(--color-brand-navy)' }}
              >
                {title}
              </h3>
              <p className="text-xs text-gray-500">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
