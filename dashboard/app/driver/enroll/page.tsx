'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoIcon } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2, ScanLine, ArrowLeft } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

type Step = 'enter-code' | 'scanning' | 'done' | 'error'

export default function RFIDEnrollPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('enter-code')
  const [code, setCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)
  const scanBufferRef = useRef('')
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When we enter scanning step, focus the hidden input so the HID scanner types into it
  useEffect(() => {
    if (step === 'scanning') {
      scanInputRef.current?.focus()
    }
  }, [step])

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.trim().length < 4) return
    setStep('scanning')
    scanBufferRef.current = ''
  }

  // Capture HID RFID scanner input: scanners send chars quickly then Enter
  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const tag = scanBufferRef.current.trim()
      scanBufferRef.current = ''
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
      if (tag) submitEnroll(tag)
      return
    }
    if (e.key.length === 1) {
      scanBufferRef.current += e.key
      // Auto-submit if no new char arrives within 100ms (scanner burst completed)
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
      scanTimerRef.current = setTimeout(() => {
        const tag = scanBufferRef.current.trim()
        scanBufferRef.current = ''
        if (tag) submitEnroll(tag)
      }, 100)
    }
  }

  const submitEnroll = async (rfidTagId: string) => {
    const deviceToken = localStorage.getItem('device_token')
    if (!deviceToken) {
      setErrorMsg('Device not provisioned.')
      setStep('error')
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/device/rfid-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
        body: JSON.stringify({ code: code.trim().toUpperCase(), rfid_tag_id: rfidTagId }),
      })
      if (res.status === 404) {
        setErrorMsg('Code not found or expired. Ask the admin to generate a new one.')
        setStep('error')
        return
      }
      if (!res.ok) {
        setErrorMsg('Failed to submit scan. Try again.')
        setStep('error')
        return
      }
      setStep('done')
    } catch {
      setErrorMsg('Network error. Check your connection.')
      setStep('error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <LogoIcon className="h-8 w-8" />
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-8">
        {step === 'enter-code' && (
          <>
            <div className="text-center">
              <ScanLine className="size-10 mx-auto mb-3" style={{ color: 'var(--color-brand-navy)' }} />
              <h2 className="text-2xl font-bold text-foreground">Enroll Student RFID</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Enter the code shown on the admin&apos;s screen, then scan the student&apos;s card.
              </p>
            </div>

            <form onSubmit={handleCodeSubmit} className="w-full max-w-xs flex flex-col gap-4">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="Enter code (e.g. A3K7PQ)"
                className="w-full text-center text-2xl font-mono font-bold tracking-widest rounded-xl border border-border px-4 py-4 outline-none focus:border-[var(--color-brand-navy)] focus:ring-2 focus:ring-[var(--color-brand-navy)]/20 uppercase"
                autoFocus
                autoComplete="off"
              />
              <Button
                type="submit"
                size="lg"
                disabled={code.trim().length < 4}
                className="h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white"
              >
                Continue
              </Button>
            </form>
          </>
        )}

        {step === 'scanning' && (
          <>
            <div className="text-center">
              <div className="size-20 rounded-full bg-[#2A7D4F]/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <ScanLine className="size-10 text-[#2A7D4F]" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Ready to Scan</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Hold the student&apos;s RFID card near the scanner now.
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Code: <span className="font-mono font-bold">{code.toUpperCase()}</span>
              </p>
            </div>
            {/* Hidden input captures HID keyboard output from the scanner */}
            <input
              ref={scanInputRef}
              className="opacity-0 absolute pointer-events-none"
              onKeyDown={handleScanKeyDown}
              readOnly
              aria-hidden="true"
            />
            <Button variant="outline" size="sm" onClick={() => setStep('enter-code')}>
              Change code
            </Button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center">
            <CheckCircle className="size-16 text-[#2A7D4F] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground">Card Scanned!</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              The admin&apos;s screen will update automatically. You can go back now.
            </p>
            <Button
              className="mt-6 bg-[#2A7D4F] hover:bg-[#235f3c] text-white"
              onClick={() => router.back()}
            >
              Done
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center">
            <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="size-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
            <p className="text-muted-foreground mt-2 text-sm">{errorMsg}</p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => { setStep('enter-code'); setCode('') }}
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
