import { api } from '@/lib/api'

export const metadata = {
  title: 'Device Images - RouteGuard',
}

async function getImages() {
  try {
    return await api.admin.images.get()
  } catch {
    return null
  }
}

export default async function DeviceImagesPage() {
  const images = await getImages()

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
        Device Base Images
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Flash one of these images to RouteGuard hardware before shipping.
        The device will check in automatically on first boot and display a claim code.
      </p>

      {!images ? (
        <p className="text-sm text-red-600">Failed to load image URLs.</p>
      ) : (
        <div className="space-y-3">
          <ImageDownloadCard
            label="ARM64"
            description="Raspberry Pi and ARM64 single-board computers"
            url={images.arm64}
          />
          <ImageDownloadCard
            label="x86-64"
            description="Generic UEFI x86-64 hardware"
            url={images.x86_64}
          />
        </div>
      )}
    </div>
  )
}

function ImageDownloadCard({
  label,
  description,
  url,
}: {
  label: string
  description: string
  url: string
}) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <a
        href={url}
        download
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--color-brand-navy)' }}
      >
        Download
      </a>
    </div>
  )
}
