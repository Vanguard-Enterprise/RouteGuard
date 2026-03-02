import Link from 'next/link'
import { Building2, Phone, Mail } from 'lucide-react'

export default function PricingPage() {
  return (
    <div className="py-20" style={{ backgroundColor: 'var(--color-brand-slate)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
          Pricing
        </h1>
        <p className="text-gray-600 text-lg mb-12 max-w-xl mx-auto">
          RouteGuard is an enterprise platform with pricing tailored to your district&apos;s size, fleet, and
          requirements.
        </p>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-left">
          <div className="flex items-start gap-4 mb-6">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--color-brand-slate)' }}
            >
              <Building2 className="w-6 h-6" style={{ color: 'var(--color-brand-navy)' }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--color-brand-navy)' }}>
                Enterprise Pricing
              </h2>
              <p className="text-gray-600 text-sm">
                Custom quotes based on fleet size, number of students, and selected modules.
              </p>
            </div>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              'Per-vehicle or per-district licensing models',
              'Unlimited users and organizations',
              'Dedicated onboarding and implementation support',
              'SLA-backed uptime guarantee',
              'SSO / SAML integration for district identity providers',
              'Custom data retention and compliance options',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: 'var(--color-brand-amber)' }}
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-amber)' }}
            >
              <Mail className="w-4 h-4" />
              Request a Quote
            </Link>
            <a
              href="tel:+18005551234"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Talk to Sales
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
