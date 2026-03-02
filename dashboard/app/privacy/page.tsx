export default function PrivacyPage() {
  return (
    <div className="min-h-screen py-20" style={{ backgroundColor: 'var(--color-brand-slate)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
          Privacy Policy
        </h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: coming soon</p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
          <p className="text-gray-600">
            Our Privacy Policy is being finalized. Please check back soon or contact us at{' '}
            <a href="mailto:privacy@routeguard.io" className="text-blue-600 hover:underline">
              privacy@routeguard.io
            </a>{' '}
            with any questions.
          </p>
        </div>
      </div>
    </div>
  )
}
