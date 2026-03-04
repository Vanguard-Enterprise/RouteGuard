import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CopyButton } from "@/components/ui/copy-button"

const SETUP_CMD = "curl -fsSL https://api.route-guard.com/setup | sudo bash"
const DEBIAN_ISO_URL = "https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.10.0-amd64-netinst.iso"

export const metadata = {
  title: "Device Setup - RouteGuard",
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  )
}

export default function AdminDevicesPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-brand-navy)" }}>
          Device Setup
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Step-by-step guide to provision a new RouteGuard kiosk device.
        </p>
      </div>

      <Tabs defaultValue="x86">
        <TabsList>
          <TabsTrigger value="x86">PC / Thin Client (x86-64)</TabsTrigger>
          <TabsTrigger value="rpi">Raspberry Pi (ARM64)</TabsTrigger>
        </TabsList>

        <TabsContent value="x86" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Step 1 - Download Debian 12</CardTitle>
              <CardDescription>Get the netinstall ISO - it downloads packages during install so you get the latest.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <a href={DEBIAN_ISO_URL} target="_blank" rel="noreferrer">
                  Download Debian 12 Netinstall ISO
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2 - Install Debian</CardTitle>
              <CardDescription>Boot from USB and run through the installer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Boot from the USB, select <strong>Install</strong> (not graphical install), then follow the prompts for language, location, and keyboard.</p>
              <Callout>
                <strong>Partitioning:</strong> Choose &quot;Guided - use entire disk&quot; then &quot;All files in one partition&quot;. Do not set up LVM or encryption.
              </Callout>
              <p className="mt-2">Set a root password when prompted - you will need it to SSH in after install.</p>
              <p>Create a normal user account when asked (any name is fine, it will not be used).</p>
              <Callout>
                <strong>Software selection:</strong> On the tasksel screen, uncheck everything. Leave only <strong>SSH server</strong> and <strong>standard system utilities</strong> checked. Do not install a desktop environment.
              </Callout>
              <p className="mt-2">Let the installer finish and reboot. Remove the USB drive when it ejects.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 3 - Run the setup script</CardTitle>
              <CardDescription>SSH in as root and run this one command.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 bg-muted rounded-md px-4 py-3 font-mono text-sm">
                <span className="flex-1 break-all">{SETUP_CMD}</span>
                <CopyButton value={SETUP_CMD} />
              </div>
              <p className="text-sm text-muted-foreground">
                Takes 3-5 minutes. The script installs Chromium, configures the kiosk service, and sets up the firewall. Reboot when it finishes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 4 - Claim the device</CardTitle>
              <CardDescription>The kiosk shows a claim code on first boot.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                After rebooting the device displays a 6-character code on screen. Enter it under{" "}
                <Link href="/admin/organizations" className="underline">
                  Organizations
                </Link>{" "}
                - select the org - Devices - Add Device.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rpi" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Step 1 - Flash the SD card</CardTitle>
              <CardDescription>Use Raspberry Pi Imager to write the OS to a microSD card.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline">
                <a href="https://www.raspberrypi.com/software/" target="_blank" rel="noreferrer">
                  Download Raspberry Pi Imager
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">
                Open Pi Imager and choose your Pi model.
              </p>
              <Callout>
                <strong>OS choice:</strong> Select <strong>Raspberry Pi OS Lite (64-bit)</strong> - not the full desktop version. It is under &quot;Raspberry Pi OS (other)&quot;.
              </Callout>
              <Callout>
                <strong>Settings (gear icon):</strong> Before writing, click the gear icon. Enable SSH, set a password, and optionally set a hostname. Do this before clicking Write - you cannot do it after.
              </Callout>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2 - Boot and connect</CardTitle>
              <CardDescription>Insert the SD card, power on, and SSH in.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Insert the SD card, connect Ethernet, and power on. Wait about 60 seconds for first boot. Find the Pi on the network (check your router or use <code className="bg-muted px-1 rounded text-xs">arp -a</code>) then SSH in as <code className="bg-muted px-1 rounded text-xs">pi@&lt;ip&gt;</code> and switch to root with <code className="bg-muted px-1 rounded text-xs">sudo su</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 3 - Run the setup script</CardTitle>
              <CardDescription>Run this command as root.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 bg-muted rounded-md px-4 py-3 font-mono text-sm">
                <span className="flex-1 break-all">{SETUP_CMD}</span>
                <CopyButton value={SETUP_CMD} />
              </div>
              <p className="text-sm text-muted-foreground">
                Takes 5-10 minutes on a Raspberry Pi. Reboot when it finishes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 4 - Claim the device</CardTitle>
              <CardDescription>The kiosk shows a claim code on first boot.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                After rebooting the device displays a 6-character code on screen. Enter it under{" "}
                <Link href="/admin/organizations" className="underline">
                  Organizations
                </Link>{" "}
                - select the org - Devices - Add Device.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
