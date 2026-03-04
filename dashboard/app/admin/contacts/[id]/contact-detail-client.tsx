'use client'

import { useState, useEffect } from 'react'
import { useContactNoteStream } from '@/hooks/use-contact-note-stream'
import { api, type ContactSubmission } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  closed: 'Closed',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  in_progress: 'secondary',
  closed: 'outline',
}

interface Props {
  submission: ContactSubmission
  currentUserId: string
}

export function ContactDetailClient({ submission, currentUserId: _currentUserId }: Props) {
  const [status, setStatus] = useState(submission.status)
  const [noteInput, setNoteInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { notes } = useContactNoteStream(submission.id, submission.notes ?? [])

  useEffect(() => {
    if (!submission.read_at) {
      api.admin.contacts.patch(submission.id, { mark_read: true }).catch(() => null)
    }
  }, [submission.id, submission.read_at])

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.admin.contacts.patch(submission.id, { status: newStatus })
      setStatus(newStatus as 'new' | 'in_progress' | 'closed')
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleAddNote = async () => {
    if (!noteInput.trim()) return
    setSubmitting(true)
    try {
      await api.admin.contacts.addNote(submission.id, noteInput.trim())
      setNoteInput('')
    } catch {
      toast.error('Failed to add note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{submission.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {submission.email} - {submission.organization}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Submitted {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-md border bg-muted/20 p-4 text-sm whitespace-pre-wrap">
          {submission.message}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Internal Notes
          </h2>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {notes.length === 0 && (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border bg-card p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{note.author_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(note.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap">{note.body}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="Add a note..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleAddNote()
                }
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={handleAddNote}
                disabled={submitting || !noteInput.trim()}
                size="sm"
              >
                {submitting ? 'Posting...' : 'Add Note'}
              </Button>
              <p className="text-xs text-muted-foreground">Cmd+Enter to submit</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
