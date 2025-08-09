'use client'

import { useState, type ReactNode, type ChangeEvent } from 'react'
import type { Referee } from '../page'
import { Button, Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, Label } from '@procomp/ui'

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div aria-hidden={disabled} className={disabled ? 'pointer-events-none opacity-50' : ''}>{trigger}</div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Referee</DialogTitle>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selected || submitting}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}