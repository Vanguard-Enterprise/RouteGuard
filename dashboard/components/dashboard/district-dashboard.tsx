import { SectionCards } from "@/components/dashboard/section-cards"
import { FakeBusTrackingMap } from "@/components/dashboard/fake-bus-tracking-map"
import { DataTable } from "@/components/dashboard/data-table"

import data from "@/app/dashboard/data.json"

export function DistrictDashboard() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <FakeBusTrackingMap />
        <DataTable data={data} />
      </div>
    </div>
  )
}
