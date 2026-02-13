import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarCheck, TrendingUp } from "lucide-react";
import Link from "next/link";

const reportCards = [
  {
    title: "Ridership Report",
    description:
      "View daily ridership data by route, including total students, boarded counts, and on-time status across date ranges.",
    href: "/dashboard/reports/ridership",
    icon: Users,
  },
  {
    title: "Attendance Report",
    description:
      "Track student attendance per day. See which students rode the bus and which did not, with board and exit times.",
    href: "/dashboard/reports/attendance",
    icon: CalendarCheck,
  },
  {
    title: "Route Performance",
    description:
      "Analyze on-time performance, average delays, and trip counts by route to identify areas for improvement.",
    href: "/dashboard/reports/performance",
    icon: TrendingUp,
  },
];

export default async function ReportsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate and view operational reports"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {reportCards.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full transition-colors hover:bg-muted/50 cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <report.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{report.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {report.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
