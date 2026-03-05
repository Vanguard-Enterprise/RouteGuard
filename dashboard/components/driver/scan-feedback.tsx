'use client'
import { useEffect } from 'react'

export type FeedbackType = 'board' | 'exit' | 'unauthorized' | 'wrong-stop' | null

interface ScanFeedbackProps {
  feedbackType: FeedbackType
  studentName?: string
  onDismiss: () => void
}

const GLOW_CONFIG: Record<Exclude<FeedbackType, null>, { color: string; label: (name?: string) => string }> = {
  board: {
    color: 'rgba(34, 197, 94, 0.7)',
    label: (name?: string) => `${name ?? 'Student'} - Boarded`,
  },
  exit: {
    color: 'rgba(245, 158, 11, 0.7)',
    label: (name?: string) => `${name ?? 'Student'} - Exited`,
  },
  'wrong-stop': {
    color: 'rgba(245, 158, 11, 0.7)',
    label: (name?: string) => `${name ?? 'Student'} - Wrong Stop`,
  },
  unauthorized: {
    color: 'rgba(239, 68, 68, 0.7)',
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
    const timer = setTimeout(onDismiss, 2500)
    return () => clearTimeout(timer)
  }, [feedbackType, onDismiss])

  if (!feedbackType) return null

  const config = GLOW_CONFIG[feedbackType]

  return (
    <>
      {/* Border glow overlay */}
      <div
        className="fixed inset-0 z-[9999] pointer-events-none animate-glow-pulse"
        style={{
          boxShadow: `inset 0 0 80px 20px ${config.color}, inset 0 0 200px 40px ${config.color}`,
        }}
      />
      {/* Notification toast at top center */}
      <div
        className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] animate-glow-slide-in pointer-events-none"
        onClick={onDismiss}
      >
        <div
          className="px-6 py-3 rounded-2xl shadow-2xl text-white font-semibold text-lg whitespace-nowrap"
          style={{
            backgroundColor: feedbackType === 'unauthorized'
              ? 'rgb(220, 38, 38)'
              : feedbackType === 'wrong-stop'
                ? 'rgb(217, 119, 6)'
                : feedbackType === 'exit'
                  ? 'rgb(217, 119, 6)'
                  : 'rgb(22, 163, 74)',
          }}
        >
          {config.label(studentName)}
        </div>
      </div>

      <style>{`
        @keyframes glow-pulse {
          0% { opacity: 0; }
          15% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-glow-pulse {
          animation: glow-pulse 2.5s ease-out forwards;
        }
        @keyframes glow-slide-in {
          0% { opacity: 0; transform: translate(-50%, -20px); }
          15% { opacity: 1; transform: translate(-50%, 0); }
          70% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
        .animate-glow-slide-in {
          animation: glow-slide-in 2.5s ease-out forwards;
        }
      `}</style>
    </>
  )
}
