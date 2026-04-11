"use client"

import { FormEvent, useEffect, useState } from "react"

import { api, type DeviceInstallCommand, type RolloutSummary, type SoftwareRelease } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton } from "@/components/ui/copy-button"

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`
}

const initialForm = {
  version: "",
  release_date: "",
  release_notes: "",
  artifact_url: "",
  artifact_sha256: "",
  installer_url: "",
  target_os: "debian",
  target_arch: "amd64",
  is_install_default: true,
}

export default function UpdatesPage() {
  const [rollout, setRollout] = useState<RolloutSummary | null>(null)
  const [releases, setReleases] = useState<SoftwareRelease[]>([])
  const [installCommand, setInstallCommand] = useState<DeviceInstallCommand | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(initialForm)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [rolloutData, releaseData, installData] = await Promise.all([
        api.platform.updates.rollout(),
        api.platform.updates.releases(),
        api.platform.updates.installCommand().catch(() => null),
      ])
      setRollout(rolloutData)
      setReleases(releaseData)
      setInstallCommand(installData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load updates data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.platform.updates.createRelease(form)
      setForm(initialForm)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create release")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6">Loading updates...</div>
  }

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
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Software Updates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publish installable device releases and copy the current one-line bootstrap command.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Install Command</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {installCommand ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <div>Release: <span className="font-semibold">{installCommand.release?.version}</span></div>
                  <div>Target: <span className="font-semibold">{installCommand.release?.target_os}/{installCommand.release?.target_arch}</span></div>
                  <div>Artifact: <a className="underline" href={installCommand.release?.artifact_url} target="_blank" rel="noreferrer">direct package</a></div>
                  <div>Checksum: <span className="font-mono text-xs">{installCommand.release?.artifact_sha256}</span></div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
                  <pre className="flex-1 overflow-x-auto whitespace-pre-wrap text-sm">{installCommand.command}</pre>
                  <CopyButton value={installCommand.command} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No installable device release is marked with package and installer metadata yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publish Device Release</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleSubmit}>
              <Input placeholder="Version" value={form.version} onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))} />
              <Input type="date" value={form.release_date} onChange={(e) => setForm((prev) => ({ ...prev, release_date: e.target.value }))} />
              <Input placeholder="Artifact URL (.deb)" value={form.artifact_url} onChange={(e) => setForm((prev) => ({ ...prev, artifact_url: e.target.value }))} />
              <Input placeholder="Artifact SHA-256" value={form.artifact_sha256} onChange={(e) => setForm((prev) => ({ ...prev, artifact_sha256: e.target.value }))} />
              <Input placeholder="Installer script URL" value={form.installer_url} onChange={(e) => setForm((prev) => ({ ...prev, installer_url: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Target OS" value={form.target_os} onChange={(e) => setForm((prev) => ({ ...prev, target_os: e.target.value }))} />
                <Input placeholder="Target Arch" value={form.target_arch} onChange={(e) => setForm((prev) => ({ ...prev, target_arch: e.target.value }))} />
              </div>
              <Textarea placeholder="Release notes" value={form.release_notes} onChange={(e) => setForm((prev) => ({ ...prev, release_notes: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_install_default}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_install_default: e.target.checked }))}
                />
                Mark as install default
              </label>
              <Button type="submit" disabled={saving}>{saving ? "Publishing..." : "Publish Release"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Published Releases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device releases published yet.</p>
          ) : (
            releases.map((release) => (
              <div key={release.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold">{release.version}</span>
                  {release.is_install_default ? <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Install default</span> : null}
                  <span className="text-sm text-muted-foreground">{release.release_date}</span>
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div>Target: <span className="font-semibold">{release.target_os}/{release.target_arch}</span></div>
                  <div>Artifact: <a className="underline" href={release.artifact_url} target="_blank" rel="noreferrer">package URL</a></div>
                  <div>Installer: <a className="underline" href={release.installer_url} target="_blank" rel="noreferrer">installer script</a></div>
                  <div>Checksum: <span className="font-mono text-xs">{release.artifact_sha256}</span></div>
                </div>
                {release.release_notes ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{release.release_notes}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
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
