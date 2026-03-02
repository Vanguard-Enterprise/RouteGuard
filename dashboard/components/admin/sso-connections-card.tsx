export default function SSOConnectionsCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
        SSO Connections
      </h3>
      <p className="text-sm text-gray-500">
        SSO connections (SAML/OIDC) for this organization are configured via the API or CLI. Use{' '}
        <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
          POST /dashboard/settings/sso
        </code>{' '}
        to create connections.
      </p>
    </div>
  )
}
