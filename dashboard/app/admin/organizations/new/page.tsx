import OrganizationForm from '@/components/admin/organization-form'

export const metadata = {
  title: 'New Organization — RouteGuard Admin',
}

export default function NewOrganizationPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        New Organization
      </h1>
      <OrganizationForm mode="create" />
    </div>
  )
}
