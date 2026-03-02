import Link from 'next/link'
import { MapPin, ScanLine, MessageCircle } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ backgroundColor: 'var(--color-brand-slate)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-3xl">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight"
              style={{ color: 'var(--color-brand-navy)' }}
            >
              Keep Every Student Safe, Every Ride
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl">
              RouteGuard gives school districts real-time visibility into every bus route — live GPS, RFID student
              check-ins, and instant guardian notifications, all in one platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center px-6 py-3 rounded-md text-base font-semibold text-white transition-colors"
                style={{ backgroundColor: 'var(--color-brand-amber)' }}
              >
                Request a Demo
              </Link>
              <Link
                href="/#how-it-works"
                className="inline-flex items-center px-6 py-3 rounded-md text-base font-semibold transition-colors border border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-white bg-transparent"
              >
                See How It Works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
              Everything you need to run safer routes
            </h2>
            <p className="mt-3 text-gray-500 text-lg max-w-xl mx-auto">
              Purpose-built for K-12 transportation departments of any size.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--color-brand-slate)' }}
              >
                <MapPin className="w-6 h-6" style={{ color: 'var(--color-brand-navy)' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
                Live GPS Tracking
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Monitor every bus in real time on an interactive map. Know exactly where each vehicle is and whether
                routes are running on schedule.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--color-brand-slate)' }}
              >
                <ScanLine className="w-6 h-6" style={{ color: 'var(--color-brand-navy)' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
                RFID Student Scanning
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Students tap their RFID tag when boarding and exiting. Every scan is logged with timestamp, stop, and
                driver — creating a complete attendance record.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--color-brand-slate)' }}
              >
                <MessageCircle className="w-6 h-6" style={{ color: 'var(--color-brand-navy)' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
                Guardian SMS Alerts
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Parents receive an automatic text the moment their child boards or exits the bus. No app required —
                just a phone number.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="py-20"
        style={{ backgroundColor: 'var(--color-brand-navy)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white">How It Works</h2>
            <p className="mt-3 text-blue-200 text-lg max-w-xl mx-auto">
              Up and running in an afternoon. No complex IT setup required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Provision Device',
                description:
                  'Plug the RouteGuard device into your bus. It self-configures using a secure provisioning token generated from the admin console.',
              },
              {
                step: '2',
                title: 'Assign Routes',
                description:
                  'Upload your route list or build routes manually. Assign vehicles, drivers, and student stops with a few clicks.',
              },
              {
                step: '3',
                title: 'Track Live',
                description:
                  "Watch buses move across the map in real time. Alerts fire automatically — you'll know about delays before parents call.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--color-brand-amber)', color: 'var(--color-brand-navy)' }}
                >
                  {item.step}
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg mb-1">{item.title}</h3>
                  <p className="text-blue-200 text-sm leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20" style={{ backgroundColor: 'var(--color-brand-slate)' }}>
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
            Ready to get started?
          </h2>
          <p className="text-gray-600 mb-8 text-lg">
            Schedule a personalized demo with our team and see RouteGuard in action with your district&apos;s data.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center px-8 py-3 rounded-md text-base font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand-amber)' }}
          >
            Request a Demo
          </Link>
        </div>
      </section>
    </div>
  )
}
