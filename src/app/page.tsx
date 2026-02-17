import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Route,
  ScanLine,
  MapPin,
  MessageSquare,
  Bus,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: Route,
    title: "Route Planning",
    description:
      "Design and optimize bus routes with drag-and-drop stop management. Minimize travel time and fuel consumption with intelligent routing.",
  },
  {
    icon: ScanLine,
    title: "RFID Student Tracking",
    description:
      "Track student boarding and exits with RFID tag scanning. Know exactly who is on each bus at all times for maximum safety.",
  },
  {
    icon: MapPin,
    title: "Real-Time GPS",
    description:
      "Monitor your entire fleet in real-time on an interactive map. Get live location updates, speed alerts, and route deviation notifications.",
  },
  {
    icon: MessageSquare,
    title: "Parent SMS Notifications",
    description:
      "Automatically notify parents when their child boards, exits, or when the bus is approaching their stop. Multilingual support included.",
  },
  {
    icon: Bus,
    title: "Fleet Management",
    description:
      "Manage your vehicles, drivers, and maintenance schedules in one place. Track vehicle capacity, inspections, and driver certifications.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description:
      "Generate detailed reports on ridership, on-time performance, route efficiency, and more. Make data-driven decisions for your fleet.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/api/r2/favicon.png" alt="RouteGuard" width={32} height={32} className="h-8 w-8" />
            <span className="text-lg font-bold">RouteGuard</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="outline" size="sm">
                Log In
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="sm">Request Demo</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              Trusted by school districts nationwide
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Safe, Smart{" "}
              <span className="text-primary">School Bus Management</span>
            </h1>

            <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
              The complete platform for school bus fleet management. RFID student tracking,
              real-time GPS monitoring, and automated parent SMS notifications &mdash; all in
              one powerful, easy-to-use dashboard.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/contact">
                <Button size="lg" className="gap-2">
                  Request a Demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="outline" size="lg">
                  Explore Features
                </Button>
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-16 flex justify-center">
            <Image
              src="/api/r2/bus-mascot.png"
              alt="RouteGuard school bus mascot"
              width={320}
              height={320}
              className="h-auto w-64 drop-shadow-lg sm:w-72 lg:w-80"
              priority
            />
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to manage your fleet
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From route planning to parent communication, RouteGuard covers every aspect
              of school bus operations.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-sm">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 text-center sm:grid-cols-3">
            <div>
              <p className="text-4xl font-bold text-primary">99.9%</p>
              <p className="mt-2 text-sm text-muted-foreground">Platform uptime</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-primary">&lt;2s</p>
              <p className="mt-2 text-sm text-muted-foreground">RFID scan processing</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-primary">24/7</p>
              <p className="mt-2 text-sm text-muted-foreground">Support available</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t bg-primary py-24 text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to modernize your school bus operations?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-primary-foreground/80">
            Join school districts across the country that trust RouteGuard to keep their
            students safe and parents informed.
          </p>
          <div className="mt-10">
            <Link href="/contact">
              <Button size="lg" variant="secondary" className="gap-2">
                Request a Demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-3">
              <Link href="/" className="flex items-center gap-2">
                <Image src="/api/r2/logo.png" alt="RouteGuard" width={160} height={46} className="h-12 w-auto" />
              </Link>
              <p className="text-sm text-muted-foreground">
                Safe, smart school bus management with RFID tracking and real-time GPS.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="#features" className="hover:text-foreground">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-foreground">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-foreground">
                    Request Demo
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/contact" className="hover:text-foreground">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-foreground">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/contact" className="hover:text-foreground">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-foreground">
                    System Status
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <Separator className="my-8" />

          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} RouteGuard. All rights reserved.
            </p>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
