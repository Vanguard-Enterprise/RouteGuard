"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { ArrowLeftIcon, ChevronDownIcon, CircleIcon, PlusIcon, SendHorizonalIcon, SmileIcon, SquarePenIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { api, SupportMessage, SupportTicket, SupportTicketStatus } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const statusOptions: Array<{ value: "all" | SupportTicketStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
]

function formatOpenedTime(value: string): string {
  const date = new Date(value)
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function formatListTime(value: string): string {
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function dayLabel(value: string): string {
  const d = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function statusText(status: SupportTicketStatus): string {
  if (status === "in_progress") return "In Progress"
  if (status === "resolved") return "Resolved"
  if (status === "waiting") return "Waiting"
  return "Open"
}

export default function HelpPage() {
  const { data: me } = useSWR("support-help-me", api.auth.me)
  const [statusFilter, setStatusFilter] = useState<"all" | SupportTicketStatus>("all")
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newSubject, setNewSubject] = useState("")
  const [newBody, setNewBody] = useState("")
  const [creating, setCreating] = useState(false)
  const [streamConnected, setStreamConnected] = useState(false)
  const [composerBody, setComposerBody] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const ticketsKey = useMemo(() => ["support-org-tickets", statusFilter], [statusFilter])
  const { data: ticketsData, isLoading: ticketsLoading, mutate: mutateTickets } = useSWR(
    ticketsKey,
    () =>
      api.org.support.listTickets({
        status: statusFilter === "all" ? undefined : statusFilter,
        page: 1,
        per_page: 100,
      })
  )

  const selectedTicket = (ticketsData?.items ?? []).find((t) => t.id === selectedTicketId) ?? null
  const messagesKey = selectedTicketId ? ["support-org-messages", selectedTicketId] : null
  const { data: messages = [], mutate: mutateMessages } = useSWR<SupportMessage[]>(
    messagesKey,
    () => api.org.support.listMessages(selectedTicketId as string),
    { fallbackData: [] }
  )

  useEffect(() => {
    if (streamConnected) return
    const id = setInterval(() => {
      mutateTickets()
      if (selectedTicketId) mutateMessages()
    }, 5000)
    return () => clearInterval(id)
  }, [streamConnected, mutateMessages, mutateTickets, selectedTicketId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, selectedTicketId])

  async function handleCreateTicket() {
    if (!newSubject.trim() || !newBody.trim() || creating) return
    setCreating(true)
    try {
      const created = await api.org.support.createTicket({ subject: newSubject.trim(), body: newBody.trim() })
      setNewSubject("")
      setNewBody("")
      setCreateDialogOpen(false)
      await mutateTickets()
      setSelectedTicketId(created.ticket.id)
      toast.success("Support ticket created")
    } catch {
      toast.error("Failed to create support ticket")
    } finally {
      setCreating(false)
    }
  }

  async function handleSendMessage() {
    if (!selectedTicket || !composerBody.trim() || sending) return
    const body = composerBody.trim()
    setSending(true)
    setComposerBody("")

    const optimisticMessage: SupportMessage = {
      id: `temp-${Date.now()}`,
      ticket_id: selectedTicket.id,
      sender_user_id: me?.user.id ?? "me",
      sender_org_id: me?.active_org.id ?? "",
      sender_is_platform: false,
      body,
      created_at: new Date().toISOString(),
    }

    await mutateMessages((current) => [...(current ?? []), optimisticMessage], false)
    try {
      await api.org.support.sendMessage(selectedTicket.id, body)
      await Promise.all([mutateMessages(), mutateTickets()])
    } catch {
      toast.error("Failed to send message")
      mutateMessages()
      setComposerBody(body)
    } finally {
      setSending(false)
    }
  }

  if (selectedTicket) {
    let previousDay = ""

    return (
      <div className="h-full min-h-0 flex flex-col">
        <Card className="flex-1 min-h-0 overflow-hidden flex flex-col rounded-none border-x-0 border-b-0">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedTicketId(null)}>
                  <ArrowLeftIcon className="size-4" />
                </Button>
                <div className="min-w-0">
                  <CardTitle className="truncate">{selectedTicket.subject}</CardTitle>
                  <p className="text-xs text-muted-foreground">Opened {formatOpenedTime(selectedTicket.created_at)}</p>
                </div>
              </div>
              <Badge variant={streamConnected ? "default" : "outline"}>
                {streamConnected ? "Live" : "Polling"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-muted/20">
              {messages.map((message) => {
                const label = dayLabel(message.created_at)
                const showDay = label !== previousDay
                previousDay = label
                const mine = message.sender_user_id === me?.user.id
                return (
                  <div key={message.id} className="mb-2">
                    {showDay ? (
                      <div className="my-4 text-center text-xs text-muted-foreground">{label}</div>
                    ) : null}
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "bg-primary/10 border border-primary/20" : "bg-background border"}`}>
                        <p className="leading-relaxed">{message.body}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatMessageTime(message.created_at)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <div className="mt-auto border-t bg-background px-2 py-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="size-10 rounded-full">
                  <PlusIcon className="size-5" />
                </Button>

                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-3xl border bg-muted/40 px-3 py-2">
                  <Textarea
                    value={composerBody}
                    onChange={(e) => setComposerBody(e.target.value)}
                    placeholder={`Message ${me?.user.name ?? "support"}`}
                    rows={1}
                    className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  />
                  <CircleIcon className="size-2 fill-emerald-500 text-emerald-500" />
                  <button type="button" className="text-sm font-medium text-muted-foreground underline underline-offset-2">
                    A
                  </button>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full">
                    <SmileIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full">
                    <SquarePenIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full">
                    <UploadIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full">
                    <CircleIcon className="size-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="size-10 rounded-xl">
                    <ChevronDownIcon className="size-4" />
                  </Button>
                  <Button onClick={handleSendMessage} disabled={!composerBody.trim() || sending} size="icon" className="size-10 rounded-xl">
                    <SendHorizonalIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Get Help</h1>
        <div className="flex items-center gap-2">
          <Badge variant={streamConnected ? "default" : "outline"}>
            {streamConnected ? "Live" : "Polling"}
          </Badge>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button">New Ticket</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Start a New Support Ticket</DialogTitle>
                <DialogDescription>
                  Share a clear summary and details so admins can respond quickly.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Ticket subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
                <Textarea
                  placeholder="Describe your issue"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={6}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTicket} disabled={!newSubject.trim() || !newBody.trim() || creating}>
                  {creating ? "Creating..." : "Create ticket"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="h-[70vh] overflow-hidden">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Your Tickets</CardTitle>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | SupportTicketStatus)}>
            <SelectTrigger className="w-full md:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-[calc(70vh-128px)] overflow-y-auto">
          <div className="overflow-hidden rounded-lg border bg-card">
            {ticketsLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
            ) : null}
            {!ticketsLoading && (ticketsData?.items.length ?? 0) === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No tickets yet.</div>
            ) : null}
            {(ticketsData?.items ?? []).map((ticket: SupportTicket) => {
              const initial = ticket.subject.trim().charAt(0).toUpperCase() || "T"
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 last:border-b-0"
                >
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-base font-medium text-foreground">{ticket.subject}</p>
                      <p className="shrink-0 text-xs text-muted-foreground">{formatListTime(ticket.last_message_at)}</p>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      Status: {statusText(ticket.status)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Opened: {formatOpenedTime(ticket.created_at)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
