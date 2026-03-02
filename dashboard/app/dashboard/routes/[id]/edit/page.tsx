import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import RouteForm from '@/components/dashboard/route-form'
import RouteBuilder from '@/components/dashboard/route-builder'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getRoute(id: string) {
  try {
    return await api.routes.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

async function getStops(id: string) {
  try {
    return await api.routes.stops.list(id)
  } catch {
    return []
  }
}

export default async function EditRoutePage({ params }: PageProps) {
  const { id } = await params
  const [route, stops] = await Promise.all([getRoute(id), getStops(id)])
  if (!route) notFound()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/dashboard/routes/${id}`}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Edit Route
        </h1>
      </div>
      <RouteForm route={route} mode="edit" />
      <RouteBuilder routeId={route.id} initialStops={stops} />
    </div>
  )
}
