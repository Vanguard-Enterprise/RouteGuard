import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CopyButton } from "@/components/ui/copy-button"

const SETUP_CMD = "curl -fsSL https://api.route-guard.com/setup | sudo bash"

const DEBIAN_ISO_URL = "https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.10.0-amd64-netinst.iso"

export const metadata = {
  title: "Provision Device - RouteGuard",
}

export default function ProvisionDevicePage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Provision a Device</h1>
        <p className="text-muted-foreground mt-1">
          Install a fresh OS, then run the setup command to turn it into a RouteGuard kiosk.
        </p>
      </div>

      <Tabs defaultValue="x86">
        <TabsList>
          <TabsTrigger value="x86">PC / VM (x86-64)</TabsTrigger>
          <TabsTrigger value="rpi">Raspberry Pi (ARM64)</TabsTrigger>
        </TabsList>

        <TabsContent value="x86" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Step 1 - Install Debian 12</CardTitle>
              <CardDescription>Download the Debian 12 netinstall ISO and install it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <a href={DEBIAN_ISO_URL} target="_blank" rel="noreferrer">
                  Download Debian 12 Netinstall ISO
                </a>
              </Button>
              <p className="text-sm text-muted-foreground mt-3">
                Boot from the ISO, choose &quot;Install&quot;, select your language/region, create a user,
                and when asked about software to install - deselect everything except &quot;SSH server&quot; and
                &quot;standard system utilities&quot;.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2 - Run the setup command</CardTitle>
              <CardDescription>SSH in as root and run this command.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 bg-muted rounded-md px-4 py-3 font-mono text-sm">
                <span className="flex-1 break-all">{SETUP_CMD}</span>
                <CopyButton value={SETUP_CMD} />
              </div>
              <p className="text-sm text-muted-foreground">
                This installs all required software and configures the kiosk. Takes 3-5 minutes.
                Reboot when prompted.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 3 - Claim the device</CardTitle>
              <CardDescription>The device will show a claim code on first boot.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                After rebooting, the kiosk displays a 6-character code. Go to{" "}
                <Link href="/dashboard/devices/claim" className="underline">
                  Devices - Add Device
                </Link>{" "}
                and enter the code.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rpi" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Step 1 - Flash Raspberry Pi OS Lite</CardTitle>
              <CardDescription>Use Raspberry Pi Imager to flash the OS to a microSD card.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline">
                <a href="https://www.raspberrypi.com/software/" target="_blank" rel="noreferrer">
                  Download Raspberry Pi Imager
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">
                In Pi Imager, choose &quot;Raspberry Pi OS Lite (64-bit)&quot;. In the settings (gear icon),
                enable SSH and set a password. Write to your SD card.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2 - Run the setup command</CardTitle>
              <CardDescription>SSH in as root and run this command.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 bg-muted rounded-md px-4 py-3 font-mono text-sm">
                <span className="flex-1 break-all">{SETUP_CMD}</span>
                <CopyButton value={SETUP_CMD} />
              </div>
              <p className="text-sm text-muted-foreground">
                This installs all required software and configures the kiosk. Takes 5-10 minutes
                on a Raspberry Pi. Reboot when prompted.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 3 - Claim the device</CardTitle>
              <CardDescription>The device will show a claim code on first boot.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                After rebooting, the kiosk displays a 6-character code. Go to{" "}
                <Link href="/dashboard/devices/claim" className="underline">
                  Devices - Add Device
                </Link>{" "}
                and enter the code.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
