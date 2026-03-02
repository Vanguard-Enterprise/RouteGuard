'use client'
import { useEffect } from 'react'

export type FeedbackType = 'board' | 'exit' | 'unauthorized' | null

interface ScanFeedbackProps {
  feedbackType: FeedbackType
  studentName?: string
  onDismiss: () => void
}

const FEEDBACK_CONFIG = {
  board: {
    bg: '#2A7D4F',
    icon: '✓',
    label: (name?: string) => `${name ?? 'Student'} — Boarded`,
  },
  exit: {
    bg: '#B8860B',
    icon: '→',
    label: (name?: string) => `${name ?? 'Student'} — Exited`,
  },
  unauthorized: {
    bg: '#C0392B',
    icon: '✗',
    label: () => 'Unknown Tag',
  },
}

export default function ScanFeedback({
  feedbackType,
  studentName,
  onDismiss,
}: ScanFeedbackProps) {
  useEffect(() => {
    if (!feedbackType) return
    const timer = setTimeout(onDismiss, 2000)
    return () => clearTimeout(timer)
  }, [feedbackType, onDismiss])

  if (!feedbackType) return null

  const config = FEEDBACK_CONFIG[feedbackType]

  return (
    <div
      style={{ background: config.bg }}
      className="
        fixed inset-0 z-50 flex flex-col items-center justify-center gap-6
        animate-fade-in
      "
      onClick={onDismiss}
    >
      <span className="text-white text-8xl font-bold">{config.icon}</span>
      <p className="text-white text-3xl font-semibold text-center px-8">
        {config.label(studentName)}
      </p>
      <p className="text-white/70 text-sm">Tap to dismiss</p>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
      `}</style>
    </div>
  )
}
