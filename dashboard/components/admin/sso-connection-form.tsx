export default function SSOConnectionForm() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
        New SSO Connection
      </h3>
      <p className="text-sm text-gray-500">
        SSO connection configuration is available via the API. Please use the API to create and manage SSO
        connections.
      </p>
    </div>
  )
}
