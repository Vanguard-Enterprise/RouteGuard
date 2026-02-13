import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Shield } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">RouteGuard</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm">
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: January 1, 2026
          </p>

          <Separator className="my-8" />

          <div className="prose prose-zinc max-w-none dark:prose-invert space-y-8">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-7">
                By accessing or using the RouteGuard platform (&quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are entering into these Terms on behalf of a school district, transportation company, or other organization, you represent that you have the authority to bind that organization to these Terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">2. Description of Service</h2>
              <p className="text-muted-foreground leading-7">
                RouteGuard provides a cloud-based school bus fleet management platform that includes route planning and optimization tools, real-time GPS vehicle tracking, RFID-based student boarding and exit tracking, automated SMS notifications to parents and guardians, fleet and driver management, and analytics and reporting dashboards.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">3. User Accounts</h2>
              <p className="text-muted-foreground leading-7">
                You are responsible for maintaining the confidentiality of your account credentials. You agree to immediately notify us of any unauthorized use of your account. Organization administrators are responsible for managing user access and roles within their organization. You must not share account credentials or allow unauthorized persons to access the Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">4. Acceptable Use</h2>
              <p className="text-muted-foreground leading-7">
                You agree to use the Service only for its intended purpose of managing school bus transportation operations. You may not use the Service to track individuals without proper authorization, access data belonging to other organizations, attempt to bypass security controls or access restrictions, reverse engineer or decompile any part of the Service, or use the Service for any unlawful purpose.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">5. Data Ownership</h2>
              <p className="text-muted-foreground leading-7">
                You retain ownership of all data you input into the Service (&quot;Customer Data&quot;). You grant us a limited license to use Customer Data solely for the purpose of providing and improving the Service. We will not sell, share, or monetize Customer Data. Upon termination, you may request export or deletion of your Customer Data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">6. Student Data</h2>
              <p className="text-muted-foreground leading-7">
                We acknowledge that student data is subject to FERPA and other applicable privacy regulations. We agree to use student data only as directed by the authorized educational institution. We will not disclose student data except as required by law or as authorized by the institution. We will implement reasonable security measures to protect student data. Upon contract termination, we will delete or return student data as requested.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">7. Service Availability</h2>
              <p className="text-muted-foreground leading-7">
                We strive to maintain high availability of the Service but do not guarantee uninterrupted access. We will provide reasonable advance notice of planned maintenance windows. In the event of service disruptions, we will work diligently to restore access. Our target uptime is 99.9% measured monthly, excluding scheduled maintenance.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">8. Fees and Payment</h2>
              <p className="text-muted-foreground leading-7">
                Subscription fees are outlined in your service agreement. Fees are billed in advance on a monthly or annual basis. We may adjust pricing with 60 days written notice. Failure to pay fees may result in suspension of access to the Service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">9. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-7">
                To the maximum extent permitted by law, RouteGuard shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with the use of the Service. Our total liability shall not exceed the amount paid by you for the Service in the twelve months preceding the claim. The Service is a management tool and does not replace the duty of care owed by drivers, school staff, and administrators.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">10. Indemnification</h2>
              <p className="text-muted-foreground leading-7">
                You agree to indemnify and hold harmless RouteGuard from any claims, damages, or expenses arising from your use of the Service, your violation of these Terms, or your violation of any applicable laws or regulations.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">11. Termination</h2>
              <p className="text-muted-foreground leading-7">
                Either party may terminate the service agreement with 30 days written notice. We reserve the right to suspend or terminate access for violation of these Terms. Upon termination, your right to use the Service immediately ceases. Data retention and deletion following termination is governed by our Privacy Policy and your service agreement.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">12. Changes to Terms</h2>
              <p className="text-muted-foreground leading-7">
                We may update these Terms from time to time. We will notify you of material changes via email or through the Service. Continued use of the Service after changes become effective constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">13. Contact</h2>
              <p className="text-muted-foreground leading-7">
                For questions about these Terms, please contact us at{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  our contact page
                </Link>{" "}
                or email legal@routeguard.com.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} RouteGuard. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
