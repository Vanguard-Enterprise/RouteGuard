import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { getServerUser } from '@/lib/server-api'

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const me = await getServerUser()

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={me?.user} />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  )
}
