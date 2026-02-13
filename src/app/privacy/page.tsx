import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Shield } from "lucide-react";

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: January 1, 2026
          </p>

          <Separator className="my-8" />

          <div className="prose prose-zinc max-w-none dark:prose-invert space-y-8">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">1. Introduction</h2>
              <p className="text-muted-foreground leading-7">
                RouteGuard (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting the privacy and security of the personal information we collect from school districts, transportation companies, parents, guardians, and students who use our school bus fleet management platform. This Privacy Policy describes how we collect, use, disclose, and safeguard your information.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">2. Information We Collect</h2>
              <p className="text-muted-foreground leading-7">
                We collect information necessary to provide school bus tracking and management services, including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Organization Data:</strong> School district or company name, address, contact information, and administrative user accounts.</li>
                <li><strong>Student Data:</strong> Student names, school assignments, grade levels, RFID tag identifiers, home addresses, and transportation assignments. We collect student data solely as directed by the school district or authorized organization.</li>
                <li><strong>Guardian Data:</strong> Parent or guardian names, phone numbers, email addresses, and SMS notification preferences.</li>
                <li><strong>Vehicle & Driver Data:</strong> Vehicle identification, GPS location data, driver names, license information, and route assignments.</li>
                <li><strong>Usage Data:</strong> Login timestamps, feature usage patterns, and system interaction logs.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-7">
                We use the collected information for the following purposes:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Providing real-time GPS tracking of school buses.</li>
                <li>Recording RFID-based student boarding and exit events.</li>
                <li>Sending SMS notifications to parents and guardians regarding their children&apos;s transportation status.</li>
                <li>Generating ridership and performance reports for school administrators.</li>
                <li>Route planning and optimization.</li>
                <li>Maintaining platform security and preventing unauthorized access.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">4. Student Data Protection (FERPA Compliance)</h2>
              <p className="text-muted-foreground leading-7">
                We recognize that student data may constitute education records under the Family Educational Rights and Privacy Act (FERPA). We act as a &quot;school official&quot; with a &quot;legitimate educational interest&quot; as defined by FERPA. We do not use student data for any purpose other than providing transportation management services as directed by the school district. We do not sell, share, or use student data for advertising or marketing purposes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">5. Children&apos;s Privacy (COPPA)</h2>
              <p className="text-muted-foreground leading-7">
                RouteGuard does not directly collect personal information from children under 13. All student data is provided by and managed through authorized school district administrators. We comply with the Children&apos;s Online Privacy Protection Act (COPPA) and only process student data as directed by the educational institution.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">6. Data Security</h2>
              <p className="text-muted-foreground leading-7">
                We implement industry-standard security measures to protect your data, including encryption in transit (TLS/SSL) and at rest, role-based access controls, regular security audits, and secure data storage with leading cloud infrastructure providers. All API access requires authenticated credentials, and administrative actions are logged for audit purposes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">7. Data Retention</h2>
              <p className="text-muted-foreground leading-7">
                We retain operational data (trip records, scan events, GPS logs) for the duration specified in your service agreement, typically up to 3 years. Upon contract termination, we will delete or return all organizational data within 90 days upon request.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">8. Third-Party Services</h2>
              <p className="text-muted-foreground leading-7">
                We use trusted third-party services for SMS delivery (e.g., Twilio), mapping and geocoding, cloud infrastructure hosting, and authentication. These providers are contractually obligated to protect data and only process it as directed by us.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">9. Your Rights</h2>
              <p className="text-muted-foreground leading-7">
                Depending on your jurisdiction, you may have the right to access, correct, or delete your personal information. School district administrators can manage user data through the platform. Parents and guardians should contact their school district to exercise rights related to student data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">10. Contact Us</h2>
              <p className="text-muted-foreground leading-7">
                If you have questions about this Privacy Policy or our data practices, please contact us at{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  our contact page
                </Link>{" "}
                or email privacy@routeguard.com.
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
