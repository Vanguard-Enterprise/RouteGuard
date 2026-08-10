'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    message: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="flex flex-col flex-1 min-h-full">
      {/* Navy hero - pulls up behind the sticky header (same trick as HeroSection) */}
      <div
        className="-mt-14 pt-28 pb-16 px-4 sm:px-6 text-center"
        style={{ backgroundColor: 'var(--color-brand-navy)' }}
      >
        <h1 className="text-4xl font-bold text-white mb-3">Get in Touch</h1>
        <p className="text-white/70 text-lg max-w-md mx-auto">
          Tell us about your district and we&apos;ll get back to you within one business day.
        </p>
      </div>

      {/* Form area - fills remaining space */}
      <div
        className="flex-1 py-14 px-4 sm:px-6"
        style={{ backgroundColor: 'var(--color-brand-slate)' }}
      >
        <div className="max-w-xl mx-auto">
          {submitted ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: 'var(--color-brand-slate)' }}
              >
                <AlertCircle className="w-7 h-7" style={{ color: 'var(--color-brand-amber)' }} />
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
                Demo Mode
              </h2>
              <p className="text-gray-600 text-sm">
                Message failed to send because this site is running in demo mode. No message was delivered.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 space-y-5"
            >
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Jane Smith"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Work Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="jane@school.edu"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>

              <div>
                <label htmlFor="organization" className="block text-sm font-medium text-gray-700 mb-1">
                  Organization / District
                </label>
                <input
                  id="organization"
                  name="organization"
                  type="text"
                  required
                  value={form.organization}
                  onChange={handleChange}
                  placeholder="Springfield Unified School District"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={6}
                  required
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us about your fleet size, current challenges, or questions..."
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-md text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-brand-amber)', color: 'var(--color-brand-navy)' }}
              >
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
