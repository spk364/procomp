'use client'

import { useState, type ReactNode, type ChangeEvent } from 'react'
import type { Referee } from '../page'
import { Button, Label } from '@procomp/ui'

interface AssignRefereeDialogProps {
  trigger: ReactNode
  referees: Referee[]
  onAssign: (refereeId: string) => Promise<void>
  disabled?: boolean
}

export function AssignRefereeDialog({ trigger, referees, onAssign, disabled }: AssignRefereeDialogProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => 
  {
    if (!selected) return
    setSubmitting(true)
    try {
      await onAssign(selected)
      setOpen(false)
      setSelected('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative inline-block">
      <div onClick={() => !disabled && setOpen((v) => !v)} aria-hidden={disabled} className={disabled ? 'pointer-events-none opacity-50' : ''}>
        {trigger}
      </div>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border bg-background p-3 shadow-md">
          <div className="space-y-2">
            <div className="text-sm font-medium">Assign Referee</div>
            <div className="space-y-2">
              <Label htmlFor="referee">Referee</Label>
              <select
                id="referee"
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={selected}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelected(e.target.value)}
              >
                <option value="">Select a referee</option>
                {referees.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.available ? '(Available)' : '(Busy)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!selected || submitting}>Assign</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}