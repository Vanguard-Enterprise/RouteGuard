'use client'
import { useEffect } from 'react'
import { CheckCircle2, LogOut, ShieldX } from 'lucide-react'

export type FeedbackType = 'board' | 'exit' | 'unauthorized' | null

interface ScanFeedbackProps {
  feedbackType: FeedbackType
  studentName?: string
  onDismiss: () => void
}

const FEEDBACK_CONFIG = {
  board: {
    bgClass: 'bg-green-600',
    Icon: CheckCircle2,
    label: (name?: string) => `${name ?? 'Student'} - Boarded`,
  },
  exit: {
    bgClass: 'bg-amber-600',
    Icon: LogOut,
    label: (name?: string) => `${name ?? 'Student'} - Exited`,
  },
  unauthorized: {
    bgClass: 'bg-destructive',
    Icon: ShieldX,
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
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 animate-scan-feedback ${config.bgClass}`}
      onClick={onDismiss}
    >
      <config.Icon className="size-24 text-white" strokeWidth={1.5} />
      <p className="text-white text-3xl font-semibold text-center px-8">
        {config.label(studentName)}
      </p>
      <p className="text-white/60 text-sm">Tap to dismiss</p>

      <style>{`
        @keyframes scan-feedback-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scan-feedback {
          animation: scan-feedback-in 0.15s ease-out;
        }
      `}</style>
    </div>
  )
}
