'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Delete } from 'lucide-react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  loading?: boolean
  error?: boolean
}

const MAX_DIGITS = 6

export default function PinPad({ onSubmit, loading = false, error = false }: PinPadProps) {
  const [digits, setDigits] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShake(true)
      const timer = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(timer)
    }
  }, [error])

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

  const numberRows = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN dot display */}
      <div className={`flex gap-3 ${shake ? 'animate-pin-shake' : ''}`}>
        {Array.from({ length: MAX_DIGITS }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors duration-150 ${
              i < digits.length
                ? error
                  ? 'bg-destructive border-destructive'
                  : 'border-[var(--color-brand-amber)]'
                : 'bg-transparent border-border'
            }`}
            style={i < digits.length && !error ? { background: 'var(--color-brand-amber)' } : undefined}
          />
        ))}
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-3 gap-3">
        {numberRows.map((btn) => (
          <Button
            key={btn}
            variant="outline"
            onClick={() => handleDigit(btn)}
            disabled={loading}
            aria-label={btn}
            className="w-[72px] h-[72px] rounded-full text-xl font-semibold active:scale-95 select-none"
          >
            {btn}
          </Button>
        ))}
        {/* Bottom row */}
        <Button
          variant="ghost"
          onClick={handleBackspace}
          disabled={loading}
          aria-label="Backspace"
          className="w-[72px] h-[72px] rounded-full active:scale-95 select-none"
        >
          <Delete className="size-5" />
        </Button>
        <Button
          variant="outline"
          onClick={() => handleDigit('0')}
          disabled={loading}
          aria-label="0"
          className="w-[72px] h-[72px] rounded-full text-xl font-semibold active:scale-95 select-none"
        >
          0
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading || digits.length < 4}
          aria-label="Confirm"
          className="w-[72px] h-[72px] rounded-full text-xl font-semibold bg-[#2A7D4F] hover:bg-[#2A7D4F]/90 text-white"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            '✓'
          )}
        </Button>
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
