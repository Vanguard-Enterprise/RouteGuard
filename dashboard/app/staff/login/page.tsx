import StaffLoginForm from '@/components/auth/staff-login-form'

export const metadata = {
  title: 'Staff Portal — RouteGuard',
}

export default function StaffLoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: `linear-gradient(135deg, var(--color-brand-navy) 0%, var(--color-brand-navy-dark) 100%)`,
      }}
    >
      <StaffLoginForm />
    </div>
  )
}
