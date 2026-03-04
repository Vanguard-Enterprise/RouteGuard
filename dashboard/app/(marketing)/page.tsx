import { HeroSection } from '@/components/hero'
import { LogosSection } from '@/components/logos-section'
import { FeatureSection } from '@/components/feature-section'
import { CallToAction } from '@/components/cta'
import { Integrations } from '@/components/integrations'
import { FaqsSection } from '@/components/faqs'

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-8">
      <HeroSection />
      {/* <LogosSection /> */}
      <section id="features" className="scroll-mt-20 px-4">
        <div className="mx-auto mb-10 max-w-5xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything you need to run safer routes
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Purpose-built for K-12 transportation departments of any size.
          </p>
        </div>
        <FeatureSection />
      </section>
      <Integrations />
      <CallToAction />
      <FaqsSection />
    </div>
  )
}
