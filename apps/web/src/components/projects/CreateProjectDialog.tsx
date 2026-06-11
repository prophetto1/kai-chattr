'use client'

import { type FormEvent, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export type ProjectCreateInput = {
  description: string
  name: string
  objectives: string
}

type CreateProjectDialogProps = {
  onCreate: (input: ProjectCreateInput) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

const EMPTY_FORM: ProjectCreateInput = {
  description: '',
  name: '',
  objectives: '',
}

export function CreateProjectDialog({
  onCreate,
  onOpenChange,
  open,
}: CreateProjectDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectCreateInput>(EMPTY_FORM)

  useEffect(() => {
    if (!open) {
      setError(null)
      setForm(EMPTY_FORM)
    }
  }, [open])

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = form.name.trim()

    if (!name) {
      setError('Enter a project name.')
      return
    }

    onCreate({
      description: form.description.trim(),
      name,
      objectives: form.objectives.trim(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-sm">New project</DialogTitle>
          <DialogDescription className="text-xs">
            Create a workspace project to group agents, sessions, files, and objectives.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5 p-5" onSubmit={submitProject}>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">Project</span>
              <Input
                autoFocus
                aria-label="Project name"
                onChange={(event) => {
                  setError(null)
                  setForm((value) => ({ ...value, name: event.target.value }))
                }}
                placeholder="Kai-chattr"
                required
                value={form.name}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">Description</span>
              <Textarea
                aria-label="Project description"
                className="min-h-24 resize-none"
                onChange={(event) =>
                  setForm((value) => ({ ...value, description: event.target.value }))
                }
                placeholder="Workspace for coordinating runtime agents and product surfaces."
                value={form.description}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">Objectives</span>
              <Input
                aria-label="Project objectives"
                onChange={(event) =>
                  setForm((value) => ({ ...value, objectives: event.target.value }))
                }
                placeholder="Ship scoped workbench sessions"
                value={form.objectives}
              />
            </label>
          </div>

          {error ? (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              className="active:scale-95"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button className="active:scale-95" type="submit">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
