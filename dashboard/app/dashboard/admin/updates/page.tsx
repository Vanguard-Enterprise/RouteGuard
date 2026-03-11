import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function UpdatesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Software Updates</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Device software rollout tracking will be available once device infrastructure is in place.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
