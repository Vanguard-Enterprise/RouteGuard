'use client'

import { useState, useEffect } from 'react'
import type { ContactNote } from '@/lib/api'

export function useContactNoteStream(submissionId: string, initialNotes: ContactNote[]) {
  const [notes, setNotes] = useState<ContactNote[]>(initialNotes)

  useEffect(() => {
    if (!submissionId) return
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/admin/contacts/${submissionId}/stream`,
      { withCredentials: true }
    )
    es.addEventListener('note', (e) => {
      const note = JSON.parse(e.data) as ContactNote
      setNotes((prev) => {
        if (prev.some((n) => n.id === note.id)) return prev
        return [...prev, note]
      })
    })
    es.onerror = () => {
      // EventSource auto-reconnects; no action needed.
    }
    return () => es.close()
  }, [submissionId])

  return { notes, setNotes }
}
