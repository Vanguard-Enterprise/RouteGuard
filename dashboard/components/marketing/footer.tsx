import Link from 'next/link'

export default function MarketingFooter() {
  return (
    <footer style={{ backgroundColor: 'var(--color-brand-navy)' }} className="text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <span className="font-bold text-xl text-white">RouteGuard</span>
            <p className="mt-3 text-sm text-blue-200 leading-relaxed">
              School bus tracking and student safety platform for modern transportation departments.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-blue-100 uppercase tracking-wider mb-4">Navigation</h3>
            <ul className="space-y-2">
              {[
                { href: '/#features', label: 'Features' },
                { href: '/contact', label: 'Contact' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-blue-200 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="mt-10 pt-6 border-t border-blue-900 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-sm text-blue-300">&copy; {new Date().getFullYear()} RouteGuard. All rights reserved.</p>
          <p className="text-xs text-blue-400">Enterprise school transportation management</p>
        </div>
      </div>
    </footer>
  )
}
