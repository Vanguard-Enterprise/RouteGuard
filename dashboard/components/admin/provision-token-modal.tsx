'use client'

import { useState } from 'react'
import { Copy, Download, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface ProvisionTokenModalProps {
  open: boolean
  token: string
  serial: string
  onClose: () => void
}

export default function ProvisionTokenModal({ open, token, serial, onClose }: ProvisionTokenModalProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const data = JSON.stringify({ serial, provision_token: token }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'provision.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Device Created</DialogTitle>
          <DialogDescription>
            Save this provisioning token — it will not be shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 font-semibold">
              This token will not be shown again. Copy or download it now.
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Serial: <strong>{serial}</strong></p>
            <div className="flex items-center gap-2">
              <code className="flex-1 block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs font-mono break-all">
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 rounded border border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
                title="Copy token"
              >
                {copied ? (
                  <CheckCircle size={15} className="text-green-600" />
                ) : (
                  <Copy size={15} className="text-gray-500" />
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Download size={14} />
              Download provision.json
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              Done
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
