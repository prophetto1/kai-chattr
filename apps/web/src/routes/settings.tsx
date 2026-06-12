'use client'

import { type ComponentType, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  IconPalette,
  IconSettings2,
  IconUserCircle,
} from '@tabler/icons-react'

import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import { useAppTheme } from '@/components/theme/AppThemeProvider'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { APP_ROUTES } from '@/lib/app-routes'

type SettingsIcon = ComponentType<{
  size?: number | string
  stroke?: number
  className?: string
}>

type SettingsSection = {
  description: string
  icon: SettingsIcon
  id: string
  label: string
}

const settingsSections = [
  {
    id: 'account',
    label: 'Account',
    description: 'Current-user profile and login identity.',
    icon: IconUserCircle,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme selection backed by the settings API.',
    icon: IconPalette,
  },
] satisfies SettingsSection[]

type SettingsSectionId = (typeof settingsSections)[number]['id']

const settingsHeaderBaseClass =
  'flex shrink-0 items-center gap-2.5 border-b border-border py-3'
const settingsHeaderIconClass =
  'flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-muted ring-1 ring-border/50'
const settingsHeaderTitleClass = 'truncate text-[13px] font-semibold leading-tight'
const settingsHeaderDescriptionClass = 'truncate text-[11px] text-muted-foreground'

function SettingsNavigation() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(settingsHeaderBaseClass, 'px-3.5')}>
        <span className={cn(settingsHeaderIconClass, 'text-foreground')}>
          <IconSettings2 className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className={settingsHeaderTitleClass}>Settings</h1>
          <p className={settingsHeaderDescriptionClass}>Current controls</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
        <TabsList
          aria-label="Settings sections"
          className="flex h-auto w-full flex-col items-stretch justify-start gap-4 bg-transparent p-2.5"
        >
          {settingsSections.map((section) => {
            const SectionIcon = section.icon

            return (
              <TabsTrigger
                className="kai-category-rail-trigger h-auto min-h-9 w-full justify-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left data-[state=active]:bg-accent data-[state=active]:shadow-none active:scale-[0.99]"
                key={section.id}
                value={section.id}
              >
                <SectionIcon className="size-[15px] shrink-0 text-muted-foreground" />
                <span className="truncate">{section.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </ScrollArea>
    </div>
  )
}

function SettingsHeader({ section }: { section: SettingsSection }) {
  const SectionIcon = section.icon

  return (
    <header className={cn(settingsHeaderBaseClass, 'px-6')}>
      <span className={settingsHeaderIconClass}>
        <SectionIcon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <h2 className={settingsHeaderTitleClass}>{section.label}</h2>
        <p className={settingsHeaderDescriptionClass}>{section.description}</p>
      </div>
    </header>
  )
}

function SettingsPanel({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="px-5 py-3.5">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <Separator className="bg-border" />
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

function SettingsRow({
  children,
  description,
  label,
}: {
  children: ReactNode
  description?: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Label className="text-[13px] font-medium">{label}</Label>
        {description ? (
          <p className="mt-1 max-w-[46ch] text-[11.5px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function AccountSettings() {
  return (
    <div className="grid gap-5">
      <SettingsPanel title="Profile">
        <SettingsRow
          description="Current-user settings are resolved from the browser session, not a user id in the URL."
          label="Signed-in user"
        >
          <span className="text-[13px] font-medium text-muted-foreground">Jon</span>
        </SettingsRow>
        <SettingsRow
          description="Workspace-specific settings will live under /w/{workspace}/settings/workspace/{section}."
          label="Settings scope"
        >
          <span className="font-mono text-[12px] text-muted-foreground">/settings/user/account</span>
        </SettingsRow>
      </SettingsPanel>
    </div>
  )
}

function AppearanceSettings() {
  const {
    error: themeError,
    isLoading: themesLoading,
    isSaving: themeSaving,
    selectedTheme,
    selectedFont,
    selectedContrast,
    fontOptions,
    contrastOptions,
    setTheme,
    setFont,
    setContrast,
    themes,
  } = useAppTheme()

  return (
    <div className="grid gap-5">
      <SettingsPanel title="Theme">
        <SettingsRow
          description="Applies the selected token palette across the app shell and workbench surfaces."
          label="Color theme"
        >
          <Select
            disabled={themesLoading || themeSaving || themes.length === 0}
            onValueChange={setTheme}
            value={selectedTheme}
          >
            <SelectTrigger aria-label="Theme" className="w-full min-w-[200px] sm:w-[240px]">
              <SelectValue placeholder={themesLoading ? 'Loading themes' : 'Select theme'} />
            </SelectTrigger>
            <SelectContent>
              {themes.map((theme) => (
                <SelectItem key={theme.id} value={theme.id}>
                  {theme.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsPanel>
      <SettingsPanel title="Typography">
        <SettingsRow
          description="Sets the primary family used for UI chrome and body copy."
          label="Font"
        >
          <Select
            disabled={
              themesLoading || themeSaving || fontOptions.length === 0
            }
            onValueChange={setFont}
            value={selectedFont}
          >
            <SelectTrigger aria-label="Font" className="w-full min-w-[200px] sm:w-[240px]">
              <SelectValue placeholder={themesLoading ? 'Loading font options' : 'Select font'} />
            </SelectTrigger>
            <SelectContent>
              {fontOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          description="Selects the contrast profile for readability and accessibility."
          label="Contrast"
        >
          <Select
            disabled={themesLoading || themeSaving || contrastOptions.length === 0}
            onValueChange={setContrast}
            value={selectedContrast}
          >
            <SelectTrigger aria-label="Contrast" className="w-full min-w-[200px] sm:w-[240px]">
              <SelectValue
                placeholder={themesLoading ? 'Loading contrast options' : 'Select contrast'}
              />
            </SelectTrigger>
            <SelectContent>
              {contrastOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsPanel>

      {themeError ? (
        <div className="rounded-[10px] border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Theme settings unavailable.
        </div>
      ) : null}
    </div>
  )
}

function SettingsContent({ sectionId }: { sectionId: SettingsSectionId }) {
  switch (sectionId) {
    case 'account':
      return <AccountSettings />
    case 'appearance':
    default:
      return <AppearanceSettings />
  }
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { sectionId } = useParams()
  const selectedSectionId = settingsSections.some((section) => section.id === sectionId)
    ? (sectionId as SettingsSectionId)
    : 'account'
  const settingsRouteBySection = {
    account: APP_ROUTES.settings,
    appearance: APP_ROUTES.settingsAppearance,
  } satisfies Record<SettingsSectionId, string>

  return (
    <AppShell
      rail={<KaiAppRail activeItem="settings" />}
    >
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(nextValue) => {
          const route = settingsRouteBySection[nextValue as SettingsSectionId]
          if (route) navigate(route)
        }}
        value={selectedSectionId}
        orientation="vertical"
      >
        <section className="flex min-h-0 flex-1 flex-col gap-[5px] md:flex-row">
          <Sheet className="max-h-[42vh] w-full shrink-0 md:max-h-none md:w-[244px]">
            <SettingsNavigation />
          </Sheet>

          <Sheet className="min-h-0 min-w-0 flex-1">
            {settingsSections.map((section) => (
              <TabsContent
                className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                key={section.id}
                value={section.id}
              >
                <SettingsHeader section={section} />
                <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
                  <div className="mx-auto grid w-full max-w-[1000px] gap-5 px-6 py-7">
                    <SettingsContent sectionId={section.id} />
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Sheet>
        </section>
      </Tabs>
    </AppShell>
  )
}
