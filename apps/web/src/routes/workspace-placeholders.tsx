'use client'

import { type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import {
  IconGitBranch,
  IconKey,
  IconSettings2,
  IconUsersGroup,
} from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ProductSectionPage } from '@/routes/product-section'
import {
  DEFAULT_WORKSPACE_PUBLIC_ID,
  workspaceRepositoriesRoute,
  workspaceSettingsRoute,
} from '@/lib/app-routes'

type WorkspaceSettingsSectionId = 'agents' | 'general' | 'members'

const workspaceSettingsSections = {
  agents: {
    description: 'Workspace-scoped agent policy and roster administration.',
    icon: IconSettings2,
    label: 'Agent Settings',
  },
  general: {
    description: 'Workspace identity, public id, and tenant-level defaults.',
    icon: IconKey,
    label: 'General Settings',
  },
  members: {
    description: 'Workspace membership, roles, and access boundaries.',
    icon: IconUsersGroup,
    label: 'Member Settings',
  },
} satisfies Record<
  WorkspaceSettingsSectionId,
  {
    description: string
    icon: typeof IconSettings2
    label: string
  }
>

function scopedValue(value: string | undefined) {
  return value?.trim() || DEFAULT_WORKSPACE_PUBLIC_ID
}

function PlaceholderPanel({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <Separator className="bg-border" />
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

function PlaceholderRow({
  action,
  description,
  label,
}: {
  action?: ReactNode
  description: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        <p className="mt-1 max-w-[62ch] text-[11.5px] leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function WorkspaceRepositoriesPage() {
  const { workspacePublicId } = useParams()
  const workspaceId = scopedValue(workspacePublicId)
  const route = workspaceRepositoriesRoute({ workspacePublicId: workspaceId })

  return (
    <ProductSectionPage
      activeItem="new-session"
      description="Workspace-scoped cloud repository selection and launch boundary."
      route={route}
      scope="workspace"
      title="Workspace Repositories"
    >
      <PlaceholderPanel title="Repository launch contract">
        <PlaceholderRow
          action={<Badge variant="secondary">cloud first</Badge>}
          description="Open Repository belongs to the selected workspace because repository access, project binding, and future session creation must be authorized through workspace membership."
          label="Scope"
        />
        <PlaceholderRow
          action={<Badge variant="outline">/api/git/*</Badge>}
          description="The current API slice lists cloud repositories by provider. Future provider connection state belongs behind this workspace route, not a global repository page."
          label="Data plane"
        />
        <PlaceholderRow
          action={(
            <Button disabled size="sm" type="button" variant="secondary">
              Provision pending
            </Button>
          )}
          description="Designer-ready placeholder only. Launch still creates a scoped session through /w/{workspace}/sessions/{session_hash}; repository management tables and provider auth are not implemented here."
          label="Implementation state"
        />
      </PlaceholderPanel>
      <PlaceholderPanel title="Route identifiers">
        <PlaceholderRow
          action={<Badge className="font-mono" variant="outline">{workspaceId}</Badge>}
          description="Public workspace identifier. Auth and membership checks must resolve the internal workspace record; user ids do not appear in this URL."
          label="workspace_public_id"
        />
        <PlaceholderRow
          action={<IconGitBranch className="size-4 text-muted-foreground" />}
          description="Provider/repository/branch are selected as workspace-owned data. They are not encoded as canonical tenant identifiers."
          label="repository selection"
        />
      </PlaceholderPanel>
    </ProductSectionPage>
  )
}

export function WorkspaceSettingsPage() {
  const { sectionId, workspacePublicId } = useParams()
  const workspaceId = scopedValue(workspacePublicId)

  if (
    sectionId !== 'agents' &&
    sectionId !== 'general' &&
    sectionId !== 'members'
  ) {
    return (
      <Navigate
        replace
        to={workspaceSettingsRoute({ sectionId: 'general', workspacePublicId: workspaceId })}
      />
    )
  }

  const section = workspaceSettingsSections[sectionId]
  const SectionIcon = section.icon
  const route = workspaceSettingsRoute({
    sectionId,
    workspacePublicId: workspaceId,
  })

  return (
    <ProductSectionPage
      activeItem="settings"
      description={section.description}
      route={route}
      scope="workspace"
      title={section.label}
    >
      <PlaceholderPanel title="Workspace settings contract">
        <PlaceholderRow
          action={<Badge variant="secondary">workspace</Badge>}
          description="Workspace settings are tenant-scoped. The browser route carries the workspace public id, and the server must authorize membership before returning or mutating any settings."
          label="Scope"
        />
        <PlaceholderRow
          action={<Badge className="font-mono" variant="outline">{workspaceId}</Badge>}
          description="This is a public workspace identifier only. Internal UUIDs remain backend-only and user identity is resolved from the auth session."
          label="workspace_public_id"
        />
        <PlaceholderRow
          action={<SectionIcon className="size-4 text-muted-foreground" />}
          description="This route is intentionally a placeholder until the workspace settings API, persistence contract, and observability span names are locked for the section."
          label={section.label}
        />
      </PlaceholderPanel>
    </ProductSectionPage>
  )
}
