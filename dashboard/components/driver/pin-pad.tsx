'use client'
import { useState, useEffect } from 'react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  loading?: boolean
  error?: boolean
}

const MAX_DIGITS = 6

export default function PinPad({ onSubmit, loading = false, error = false }: PinPadProps) {
  const [digits, setDigits] = useState('')
  const [shake, setShake] = useState(false)

  // Trigger shake animation on error
  useEffect(() => {
    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShake(true)
      const timer = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Clear digits on error
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setDigits(''), 1500)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleDigit = (d: string) => {
    if (loading) return
    setDigits((prev) => (prev.length < MAX_DIGITS ? prev + d : prev))
  }

  const handleBackspace = () => {
    if (loading) return
    setDigits((prev) => prev.slice(0, -1))
  }

  const handleConfirm = () => {
    if (loading || digits.length < 4) return
    onSubmit(digits)
  }

  const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN display */}
      <div className="flex gap-3">
        {Array.from({ length: MAX_DIGITS }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors duration-150 ${
              i < digits.length
                ? error
                  ? 'bg-red-500 border-red-500'
                  : 'bg-amber-400 border-amber-400'
                : 'bg-transparent border-blue-300'
            } ${shake ? 'animate-pin-shake' : ''}`}
          />
        ))}
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-3 gap-3">
        {buttons.map((btn) => {
          const isBackspace = btn === '⌫'
          const isConfirm = btn === '✓'
          return (
            <button
              key={btn}
              onClick={isBackspace ? handleBackspace : isConfirm ? handleConfirm : () => handleDigit(btn)}
              disabled={loading || (isConfirm && digits.length < 4)}
              aria-label={isBackspace ? 'Backspace' : isConfirm ? 'Confirm' : btn}
              style={{ width: 70, height: 70 }}
              className={`
                rounded-full text-xl font-semibold flex items-center justify-center
                transition-all duration-100 active:scale-95 select-none
                ${isConfirm
                  ? 'bg-green-600 text-white hover:bg-green-500 disabled:opacity-40'
                  : isBackspace
                  ? 'bg-blue-800 text-blue-200 hover:bg-blue-700'
                  : 'bg-blue-800 text-white hover:bg-blue-700'
                }
                disabled:cursor-not-allowed
              `}
            >
              {loading && isConfirm ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                btn
              )}
            </button>
          )
        })}
      </div>

      <style>{`
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-pin-shake {
          animation: pin-shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}
