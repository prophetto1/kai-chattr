'use client'

import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  IconDeviceFloppy,
  IconMinus,
  IconPalette,
  IconPlus,
  IconRefresh,
  IconSettings2,
  IconUserCircle,
} from '@tabler/icons-react'

import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import { useAppTheme } from '@/components/theme/AppThemeProvider'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { APP_ROUTES } from '@/lib/app-routes'
import {
  applyThemeTypeVariables,
  builtInDefaultTheme,
  mergeThemeWithTypeOverrides,
  typographyStyle,
  typographyRoleGroups as buildTypographyRoleGroups,
  type FontFaceOption,
  type FontSlotName,
  type ThemeTypographyRole,
  type ThemeTypeOverrides,
  type TypographyRoleGroup,
  type TypographyRoleName,
  type TypographyRoleView,
} from '@/lib/design-system'

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
const settingsHeaderTitleClass = 'truncate'
const settingsHeaderDescriptionClass = 'truncate text-muted-foreground'

function SettingsNavigation() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(settingsHeaderBaseClass, 'px-3.5')}>
        <span className={cn(settingsHeaderIconClass, 'text-foreground')}>
          <IconSettings2 className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className={settingsHeaderTitleClass} style={typographyStyle('ui.body-strong')}>Settings</h1>
          <p className={settingsHeaderDescriptionClass} style={typographyStyle('ui.caption')}>Current controls</p>
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
        <h2 className={settingsHeaderTitleClass} style={typographyStyle('ui.body-strong')}>{section.label}</h2>
        <p className={settingsHeaderDescriptionClass} style={typographyStyle('ui.caption')}>{section.description}</p>
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
        <Label style={typographyStyle('ui.body-strong')}>{label}</Label>
        {description ? (
          <p className="mt-1 max-w-[46ch] text-muted-foreground" style={typographyStyle('ui.caption')}>
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function TypographySaveActions({
  controlsDisabled,
  isDirty,
  isSaving,
  onDiscard,
  onSave,
}: {
  controlsDisabled: boolean
  isDirty: boolean
  isSaving: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span
        className={cn('text-muted-foreground', isDirty && 'text-foreground')}
        style={typographyStyle('ui.caption')}
      >
        {isDirty ? 'Unsaved typography changes' : 'Typography saved'}
      </span>
      <div className="flex items-center gap-2">
        <Button
          disabled={controlsDisabled || !isDirty}
          onClick={onDiscard}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconRefresh className="size-3.5" />
          Discard
        </Button>
        <Button
          disabled={controlsDisabled || !isDirty}
          onClick={onSave}
          size="sm"
          type="button"
        >
          <IconDeviceFloppy className="size-3.5" />
          {isSaving ? 'Saving' : 'Save'}
        </Button>
      </div>
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
          <span className="text-muted-foreground" style={typographyStyle('ui.body-strong')}>Jon</span>
        </SettingsRow>
        <SettingsRow
          description="Workspace-specific settings will live under /w/{workspace}/settings/workspace/{section}."
          label="Settings scope"
        >
          <span className="text-muted-foreground" style={typographyStyle('code.inline')}>/settings/user/account</span>
        </SettingsRow>
      </SettingsPanel>
    </div>
  )
}

const TYPOGRAPHY_SAMPLE_TEXT: Record<string, string> = {
  'display.hero': 'Kai Chattr',
  'display.title': 'Workspace title',
  'display.subtitle': 'Session subtitle',
  'prose.body': 'A readable message appears here.',
  'prose.h1': 'Document heading',
  'prose.h2': 'Section heading',
  'prose.h3': 'Subsection heading',
  'prose.h4': 'Small heading',
  'code.block': 'const value = 42',
  'code.inline': 'inline_code',
  'code.diff': '+ changed line',
  'code.stat': '+12 -3',
  numeric: '1,024',
}

function typographySample(roleName: TypographyRoleName) {
  return TYPOGRAPHY_SAMPLE_TEXT[String(roleName)] ?? 'The quick brown fox Ag 0123'
}

function tokenText(value: string | number | undefined) {
  return value === undefined ? '' : String(value)
}

function stepCssLength(value: string | number | undefined, delta: number) {
  const rawValue = tokenText(value)
  const match = rawValue.match(/^(-?\d+(?:\.\d+)?)(px)?$/i)
  if (!match) return rawValue
  const nextValue = Math.max(1, Math.round((Number.parseFloat(match[1]) + delta) * 10) / 10)
  return `${nextValue}${match[2]?.toLowerCase() ?? 'px'}`
}

function stepWeight(value: string | number | undefined, delta: number) {
  const currentValue = Number.parseFloat(tokenText(value))
  if (!Number.isFinite(currentValue)) return tokenText(value)
  return String(Math.min(900, Math.max(100, currentValue + delta)))
}

type FontDraft = Partial<Record<FontSlotName, string>>

function normalizeTypeOverrides(overrides: ThemeTypeOverrides | undefined): ThemeTypeOverrides {
  return { roles: { ...(overrides?.roles ?? {}) } }
}

function mergeRoleOverride(
  overrides: ThemeTypeOverrides,
  roleName: TypographyRoleName,
  override: ThemeTypographyRole,
): ThemeTypeOverrides {
  const currentRoles = overrides.roles ?? {}
  const currentRole = currentRoles[String(roleName)] ?? {}
  const nextRole = Object.fromEntries(
    Object.entries({ ...currentRole, ...override }).filter(([, value]) => value !== undefined && value !== ''),
  ) as ThemeTypographyRole
  const nextRoles = { ...currentRoles }

  if (Object.keys(nextRole).length === 0) {
    delete nextRoles[String(roleName)]
  } else {
    nextRoles[String(roleName)] = nextRole
  }

  return { roles: nextRoles }
}

function mergeRoleOverrides(
  overrides: ThemeTypeOverrides,
  updates: ReadonlyArray<{ roleName: TypographyRoleName; override: ThemeTypographyRole }>,
): ThemeTypeOverrides {
  return updates.reduce(
    (nextOverrides, update) => mergeRoleOverride(nextOverrides, update.roleName, update.override),
    overrides,
  )
}

function resetRoleOverrides(
  overrides: ThemeTypeOverrides,
  roleNames: ReadonlyArray<TypographyRoleName>,
): ThemeTypeOverrides {
  const nextRoles = { ...(overrides.roles ?? {}) }
  for (const roleName of roleNames) {
    delete nextRoles[String(roleName)]
  }
  return { roles: nextRoles }
}

function stableSettingsKey(value: unknown) {
  return JSON.stringify(value)
}

function uniqueFontFaceOptions(fontSlots: ReadonlyArray<{ options: FontFaceOption[] }>) {
  const options = new Map<string, FontFaceOption>()
  for (const slot of fontSlots) {
    for (const option of slot.options) {
      if (!options.has(option.value)) {
        options.set(option.value, option)
      }
    }
  }
  return Array.from(options.values())
}

function defaultTypefaceLabel(
  role: TypographyRoleView,
  fontSlots: ReadonlyArray<{ slot: FontSlotName; selected: string; options: FontFaceOption[] }>,
) {
  const family = role.defaultRole.family ?? role.resolvedRole.family
  const slot = fontSlots.find((candidate) => candidate.slot === family)
  const selected = slot?.options.find((option) => option.value === slot.selected)
  return selected?.label ?? family ?? 'default'
}

function StepperControl({
  disabled,
  label,
  onDecrease,
  onIncrease,
  value,
}: {
  disabled: boolean
  label: string
  onDecrease: () => void
  onIncrease: () => void
  value: string
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={`Decrease ${label}`}
        disabled={disabled}
        onClick={onDecrease}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <IconMinus className="size-3" />
      </Button>
      <span className="min-w-[52px] text-center tabular-nums" style={typographyStyle('code.stat')}>
        {value}
      </span>
      <Button
        aria-label={`Increase ${label}`}
        disabled={disabled}
        onClick={onIncrease}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <IconPlus className="size-3" />
      </Button>
    </div>
  )
}

function TypographyGroupControls({
  controlsDisabled,
  group,
  onResetGroup,
  onUpdateGroup,
}: {
  controlsDisabled: boolean
  group: TypographyRoleGroup
  onResetGroup: (roleNames: ReadonlyArray<TypographyRoleName>) => void
  onUpdateGroup: (updates: ReadonlyArray<{ roleName: TypographyRoleName; override: ThemeTypographyRole }>) => void
}) {
  const updateGroup = (field: 'size' | 'weight' | 'line', delta: number) => {
    const updates = group.roles
      .map((role) => {
        const value = role.resolvedRole[field]
        const nextValue = field === 'weight' ? stepWeight(value, delta) : stepCssLength(value, delta)
        if (!nextValue || nextValue === tokenText(value)) return null
        return { roleName: role.name, override: { [field]: nextValue } as ThemeTypographyRole }
      })
      .filter((update): update is { roleName: TypographyRoleName; override: ThemeTypographyRole } => Boolean(update))

    if (updates.length > 0) {
      onUpdateGroup(updates)
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[7px] border border-border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground" style={typographyStyle('ui.label')}>Apply to all</span>
      <div className="flex flex-wrap items-center gap-2">
        <StepperControl
          disabled={controlsDisabled}
          label={`${group.label} role sizes`}
          onDecrease={() => updateGroup('size', -1)}
          onIncrease={() => updateGroup('size', 1)}
          value="Size"
        />
        <StepperControl
          disabled={controlsDisabled}
          label={`${group.label} role weights`}
          onDecrease={() => updateGroup('weight', -100)}
          onIncrease={() => updateGroup('weight', 100)}
          value="Weight"
        />
        <StepperControl
          disabled={controlsDisabled}
          label={`${group.label} role line heights`}
          onDecrease={() => updateGroup('line', -1)}
          onIncrease={() => updateGroup('line', 1)}
          value="Line"
        />
        <Button
          disabled={controlsDisabled || group.roles.every((role) => !role.isCustomized)}
          onClick={() => onResetGroup(group.roles.map((role) => role.name))}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconRefresh className="size-3.5" />
          Reset
        </Button>
      </div>
    </div>
  )
}

function TypographyRoleRow({
  controlsDisabled,
  defaultTypeface,
  fontFaceOptions,
  fontSlotDefaults,
  onChange,
  onReset,
  role,
}: {
  controlsDisabled: boolean
  defaultTypeface: string
  fontFaceOptions: FontFaceOption[]
  fontSlotDefaults: ReadonlyArray<{
    label: string
    selected: string
    slot: FontSlotName
    options: FontFaceOption[]
  }>
  onChange: (roleName: TypographyRoleName, override: ThemeTypographyRole) => void
  onReset: (roleName: TypographyRoleName) => void
  role: TypographyRoleView
}) {
  const resolved = role.resolvedRole
  const selectedConcreteTypeface = fontFaceOptions.find((option) => option.value === role.overrideRole.family)
  const selectedSlotTypeface = fontSlotDefaults.find((slot) => slot.slot === role.overrideRole.family)
  const selectedSlotOption = selectedSlotTypeface?.options.find((option) => option.value === selectedSlotTypeface.selected)
  const typefaceValue =
    selectedConcreteTypeface || selectedSlotTypeface
      ? (role.overrideRole.family ?? '__default__')
      : '__default__'
  const sizeValue = tokenText(role.overrideRole.size ?? resolved.size)
  const weightValue = tokenText(role.overrideRole.weight ?? resolved.weight)
  const lineValue = tokenText(role.overrideRole.line ?? resolved.line)

  return (
    <TableRow>
      <TableCell className="min-w-[170px] whitespace-normal">
        <div className="grid gap-1">
          <span style={typographyStyle('code.inline')}>{role.name}</span>
          {role.isCustomized ? (
            <span className="text-muted-foreground" style={typographyStyle('ui.caption')}>custom</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[220px] whitespace-normal">
        <span className="block truncate" style={typographyStyle(role.name)}>
          {typographySample(role.name)}
        </span>
      </TableCell>
      <TableCell className="min-w-[172px]">
        <Select
          disabled={controlsDisabled}
          onValueChange={(value) => onChange(role.name, { family: value === '__default__' ? '' : value })}
          value={typefaceValue}
        >
          <SelectTrigger aria-label={`${role.name} typeface`} className="h-8 w-[156px]">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">Default ({defaultTypeface})</SelectItem>
            {selectedSlotTypeface ? (
              <SelectItem value={selectedSlotTypeface.slot}>
                {selectedSlotTypeface.label} default ({selectedSlotOption?.label ?? selectedSlotTypeface.selected})
              </SelectItem>
            ) : null}
            {fontFaceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span style={{ fontFamily: option.stack }}>{option.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <StepperControl
          disabled={controlsDisabled}
          label={`${role.name} size`}
          onDecrease={() => onChange(role.name, { size: stepCssLength(sizeValue, -1) })}
          onIncrease={() => onChange(role.name, { size: stepCssLength(sizeValue, 1) })}
          value={sizeValue}
        />
      </TableCell>
      <TableCell>
        <StepperControl
          disabled={controlsDisabled}
          label={`${role.name} weight`}
          onDecrease={() => onChange(role.name, { weight: stepWeight(weightValue, -100) })}
          onIncrease={() => onChange(role.name, { weight: stepWeight(weightValue, 100) })}
          value={weightValue}
        />
      </TableCell>
      <TableCell>
        <StepperControl
          disabled={controlsDisabled}
          label={`${role.name} line height`}
          onDecrease={() => onChange(role.name, { line: stepCssLength(lineValue, -1) })}
          onIncrease={() => onChange(role.name, { line: stepCssLength(lineValue, 1) })}
          value={lineValue}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          aria-label={`Reset ${role.name}`}
          disabled={controlsDisabled || !role.isCustomized}
          onClick={() => onReset(role.name)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <IconRefresh className="size-3" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function AppearanceSettings() {
  const {
    error: themeError,
    isLoading: themesLoading,
    isSaving: themeSaving,
    selectedTheme,
    setTheme,
    themes,
    fontSlots,
    typeOverrides,
    saveTypographySettings,
  } = useAppTheme()

  const controlsDisabled = themesLoading || themeSaving
  const persistedFonts = useMemo<FontDraft>(() => {
    return Object.fromEntries(fontSlots.map((slot) => [slot.slot, slot.selected])) as FontDraft
  }, [fontSlots])
  const persistedTypeOverrides = useMemo(() => normalizeTypeOverrides(typeOverrides), [typeOverrides])
  const persistedFontsKey = useMemo(() => stableSettingsKey(persistedFonts), [persistedFonts])
  const persistedTypeOverridesKey = useMemo(() => stableSettingsKey(persistedTypeOverrides), [persistedTypeOverrides])
  const [draftFonts, setDraftFonts] = useState<FontDraft>(persistedFonts)
  const [draftTypeOverrides, setDraftTypeOverrides] = useState<ThemeTypeOverrides>(persistedTypeOverrides)

  useEffect(() => {
    setDraftFonts(persistedFonts)
  }, [persistedFonts, persistedFontsKey])

  useEffect(() => {
    setDraftTypeOverrides(persistedTypeOverrides)
  }, [persistedTypeOverrides, persistedTypeOverridesKey])

  const draftFontSlots = useMemo(() => {
    return fontSlots.map((slot) => {
      const selected = draftFonts[slot.slot]
      return {
        ...slot,
        selected:
          typeof selected === 'string' && slot.options.some((option) => option.value === selected)
            ? selected
            : slot.selected,
      }
    })
  }, [draftFonts, fontSlots])
  const fontFaceOptions = useMemo(() => uniqueFontFaceOptions(draftFontSlots), [draftFontSlots])

  const draftTypographyRoleGroups = useMemo(
    () => buildTypographyRoleGroups(draftTypeOverrides),
    [draftTypeOverrides],
  )
  const draftTypographyTheme = useMemo(
    () => mergeThemeWithTypeOverrides(builtInDefaultTheme, draftTypeOverrides),
    [draftTypeOverrides],
  )
  const draftFontsKey = useMemo(() => stableSettingsKey(draftFonts), [draftFonts])
  const draftTypeOverridesKey = useMemo(() => stableSettingsKey(draftTypeOverrides), [draftTypeOverrides])
  const isTypographyDirty =
    draftFontsKey !== persistedFontsKey || draftTypeOverridesKey !== persistedTypeOverridesKey

  useEffect(() => {
    const root = document.documentElement
    applyThemeTypeVariables(root, draftTypographyTheme)
    for (const slot of draftFontSlots) {
      const option = slot.options.find((candidate) => candidate.value === slot.selected)
      if (option) {
        root.style.setProperty(slot.cssVariable, option.stack)
      }
    }

    return () => {
      applyThemeTypeVariables(root, mergeThemeWithTypeOverrides(builtInDefaultTheme, persistedTypeOverrides))
      for (const slot of fontSlots) {
        const option = slot.options.find((candidate) => candidate.value === slot.selected)
        if (option) {
          root.style.setProperty(slot.cssVariable, option.stack)
        }
      }
    }
  }, [draftFontSlots, draftTypographyTheme, fontSlots, persistedTypeOverrides])

  const setDraftFontFamily = (slot: FontSlotName, value: string) => {
    setDraftFonts((current) => ({ ...current, [slot]: value }))
  }
  const setDraftTypographyRoleOverride = (roleName: TypographyRoleName, override: ThemeTypographyRole) => {
    setDraftTypeOverrides((current) => mergeRoleOverride(current, roleName, override))
  }
  const setDraftTypographyRoleOverrides = (
    updates: ReadonlyArray<{ roleName: TypographyRoleName; override: ThemeTypographyRole }>,
  ) => {
    setDraftTypeOverrides((current) => mergeRoleOverrides(current, updates))
  }
  const resetDraftTypographyRoleOverride = (roleName: TypographyRoleName) => {
    setDraftTypeOverrides((current) => resetRoleOverrides(current, [roleName]))
  }
  const resetDraftTypographyRoleOverrides = (roleNames: ReadonlyArray<TypographyRoleName>) => {
    setDraftTypeOverrides((current) => resetRoleOverrides(current, roleNames))
  }
  const discardTypographyDraft = () => {
    setDraftFonts(persistedFonts)
    setDraftTypeOverrides(persistedTypeOverrides)
  }
  const saveTypographyDraft = () => {
    saveTypographySettings({ fonts: draftFonts, typeOverrides: draftTypeOverrides })
  }

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
        <TypographySaveActions
          controlsDisabled={controlsDisabled}
          isDirty={isTypographyDirty}
          isSaving={themeSaving}
          onDiscard={discardTypographyDraft}
          onSave={saveTypographyDraft}
        />
        {draftFontSlots.map((slot) => {
          const selectedOption = slot.options.find((option) => option.value === slot.selected)
          return (
            <SettingsRow description={slot.description} key={slot.slot} label={slot.label}>
              <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-[240px]">
                <Select
                  disabled={controlsDisabled || slot.options.length === 0}
                  onValueChange={(value) => setDraftFontFamily(slot.slot, value)}
                  value={slot.selected}
                >
                  <SelectTrigger aria-label={`${slot.label} typeface`} className="w-full">
                    <SelectValue placeholder="Select face" />
                  </SelectTrigger>
                  <SelectContent>
                    {slot.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span style={{ fontFamily: option.stack }}>{option.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span
                  className="truncate text-muted-foreground"
                  style={{ fontFamily: selectedOption?.stack, fontSize: '14px', lineHeight: '20px' }}
                >
                  The quick brown fox — Ag 0123
                </span>
              </div>
            </SettingsRow>
          )
        })}
      </SettingsPanel>
      <SettingsPanel title="Typography roles">
        <TypographySaveActions
          controlsDisabled={controlsDisabled}
          isDirty={isTypographyDirty}
          isSaving={themeSaving}
          onDiscard={discardTypographyDraft}
          onSave={saveTypographyDraft}
        />
        <Accordion
          className="w-full"
          defaultValue={['display']}
          type="multiple"
        >
          {draftTypographyRoleGroups.map((group) => {
            const customizedCount = group.roles.filter((role) => role.isCustomized).length

            return (
              <AccordionItem className="border-border" key={group.id} value={group.id}>
                <AccordionTrigger className="px-5 py-4 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
                    <div className="min-w-0">
                      <h3 className="truncate" style={typographyStyle('ui.body-strong')}>{group.label} roles</h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-muted-foreground" style={typographyStyle('code.stat')}>
                      {customizedCount ? <span>{customizedCount} custom</span> : null}
                      <span>{group.roles.length}</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5">
                  <TypographyGroupControls
                    controlsDisabled={controlsDisabled}
                    group={group}
                    onResetGroup={resetDraftTypographyRoleOverrides}
                    onUpdateGroup={setDraftTypographyRoleOverrides}
                  />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[190px]">Role</TableHead>
                          <TableHead>Sample</TableHead>
                          <TableHead className="w-[172px]">Typeface</TableHead>
                          <TableHead className="w-[92px]">Size</TableHead>
                          <TableHead className="w-[92px]">Weight</TableHead>
                          <TableHead className="w-[92px]">Line</TableHead>
                          <TableHead className="w-[44px] text-right" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.roles.map((role) => (
                          <TypographyRoleRow
                            controlsDisabled={controlsDisabled}
                            defaultTypeface={defaultTypefaceLabel(role, draftFontSlots)}
                            fontFaceOptions={fontFaceOptions}
                            fontSlotDefaults={draftFontSlots}
                            key={role.name}
                            onChange={setDraftTypographyRoleOverride}
                            onReset={resetDraftTypographyRoleOverride}
                            role={role}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
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
          if (nextValue === 'account' || nextValue === 'appearance') {
            navigate(settingsRouteBySection[nextValue])
          }
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
