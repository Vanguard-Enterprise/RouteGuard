import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`
}

export default async function UpdatesPage() {
  const rollout = await api.platform.updates.rollout().catch(() => null)

  if (!rollout) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Software Updates</h1>
        <Card>
          <CardHeader>
            <CardTitle>Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              RouteGuard could not load the rollout summary. Verify the device infrastructure migration and platform API are running.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Software Updates</h1>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Latest Release</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rollout.latest_release?.version ?? "None"}</p>
            <p className="text-sm text-muted-foreground">{rollout.latest_release?.release_date ?? "No release published"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rollout.total_devices}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>On Latest</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rollout.on_latest}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fleet Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPercent(rollout.percent_up_to_date)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        {rollout.organizations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Devices Yet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Device rollout tracking is active, but no bus computers have checked in yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          rollout.organizations.map((org) => (
            <Card key={org.org_id}>
              <CardHeader>
                <CardTitle>{org.org_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4 text-sm">
                  <div>Total devices: <span className="font-semibold">{org.total_devices}</span></div>
                  <div>On latest: <span className="font-semibold">{org.on_latest}</span></div>
                  <div>Behind latest: <span className="font-semibold">{org.behind_latest}</span></div>
                  <div>Coverage: <span className="font-semibold">{formatPercent(org.percent_up_to_date)}</span></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-4">Device</th>
                        <th className="py-2 pr-4">Vehicle</th>
                        <th className="py-2 pr-4">Version</th>
                        <th className="py-2 pr-4">Connectivity</th>
                        <th className="py-2 pr-4">Health</th>
                        <th className="py-2">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {org.devices.map((device) => (
                        <tr key={device.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{device.name || device.device_key}</td>
                          <td className="py-2 pr-4">{device.vehicle_label || "Unassigned"}</td>
                          <td className="py-2 pr-4">{device.software_version || "unknown"}</td>
                          <td className="py-2 pr-4">{device.connectivity_state}</td>
                          <td className="py-2 pr-4">{device.app_health}</td>
                          <td className="py-2">{device.last_seen_at ?? "Never"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
