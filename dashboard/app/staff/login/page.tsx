import Image from 'next/image'
import StaffLoginForm from '@/components/auth/staff-login-form'

export const metadata = { title: 'Staff Portal - RouteGuard' }

export default function StaffLoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <Image src="/text-logo.png" alt="RouteGuard" height={36} width={180} className="object-contain" />
        </div>
        <StaffLoginForm />
      </div>
    </div>
  )
}
