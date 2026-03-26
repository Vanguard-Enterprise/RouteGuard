import { HeroSection } from '@/components/hero'

import { FeatureSection } from '@/components/feature-section'
import { CallToAction } from '@/components/cta'
import { Integrations } from '@/components/integrations'
import { FaqsSection } from '@/components/faqs'

export default function LandingPage() {
  const researchStats = [
    {
      label: 'Students riding buses daily',
      value: '26M+',
      detail: 'Across U.S. school transportation systems',
    },
    {
      label: 'Primary research responses',
      value: '105',
      detail: 'Teachers, administrators, drivers, and transportation leaders',
    },
    {
      label: 'Parents concerned',
      value: '69%',
      detail: 'Parents who reported concern about current transportation processes',
    },
    {
      label: 'Projected market growth',
      value: '$2.3B → $5.45B',
      detail: 'School transportation solutions market growth from 2024 to 2033',
    },
  ]

  return (
    <div className="space-y-16 pb-8">
      <HeroSection />
      {/* <LogosSection /> */}
      <section id="features" className="scroll-mt-20 px-4">
        <div className="mx-auto mb-10 max-w-5xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Close the safety gap in daily transportation
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            RouteGuard combines student verification, parent communication, and
            emergency response into one district-ready platform.
          </p>
        </div>
        <FeatureSection />
      </section>
      <section className="px-4">
        <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-6 md:p-8">
          <div className="mb-6 flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Research Snapshot
            </h2>
            <p className="text-muted-foreground">
              Highlights from the RouteGuard business plan and primary research.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {researchStats.map((stat) => (
              <article
                key={stat.label}
                className="rounded-xl border bg-background p-4"
              >
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="mt-1 font-medium text-foreground">{stat.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Integrations />
      <CallToAction />
      <FaqsSection />
    </div>
  )
}
