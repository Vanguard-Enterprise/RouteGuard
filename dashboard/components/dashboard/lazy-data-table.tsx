"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import type { RouteTableRow } from "@/components/dashboard/data-table"

const DataTable = dynamic(
  () => import("@/components/dashboard/data-table").then((module) => module.DataTable),
  {
    loading: () => <div className="mx-4 h-96 animate-pulse rounded-xl bg-muted lg:mx-6" />,
    ssr: false,
  }
)

export function LazyDataTable({ data }: { data: RouteTableRow[] }) {
  const boundaryRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const boundary = boundaryRef.current
    if (!boundary || shouldLoad) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShouldLoad(true)
        observer.disconnect()
      },
      { rootMargin: "300px" }
    )

    observer.observe(boundary)
    return () => observer.disconnect()
  }, [shouldLoad])

  return (
    <div ref={boundaryRef} className="min-h-96">
      {shouldLoad ? <DataTable data={data} /> : <div className="mx-4 h-96 rounded-xl bg-muted/40 lg:mx-6" />}
    </div>
  )
}
