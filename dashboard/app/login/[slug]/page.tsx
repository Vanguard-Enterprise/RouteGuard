import OrgLoginForm from '@/components/auth/org-login-form'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function OrgLoginPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: `linear-gradient(135deg, var(--color-brand-navy) 0%, var(--color-brand-navy-dark) 100%)`,
      }}
    >
      <OrgLoginForm
        orgName={slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        slug={slug}
        hasPasswordAuth={true}
        ssoConnections={[]}
      />
    </div>
  )
}
