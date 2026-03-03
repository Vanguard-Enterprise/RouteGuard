import Image from 'next/image'
import OrgLoginForm from '@/components/auth/org-login-form'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function OrgLoginPage({ params }: PageProps) {
  const { slug } = await params
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <Image src="/text-logo.png" alt="RouteGuard" height={36} width={180} className="object-contain" />
        </div>
        <OrgLoginForm
          orgName={slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          slug={slug}
          hasPasswordAuth={true}
          ssoConnections={[]}
        />
      </div>
    </div>
  )
}
