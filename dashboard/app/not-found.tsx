import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { NotFoundPage } from '@/components/not-found'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <NotFoundPage />
      </main>
      <Footer />
    </div>
  )
}
