import type { CSSProperties } from 'react'

import designSystemConfig from '@/config/design-system.json'

type DesignSystemConfig = typeof designSystemConfig
type FontFamilyName = keyof DesignSystemConfig['fontFamilies']
export type TypographyRoleName = keyof DesignSystemConfig['typography']['roles']

type TypographyRole = DesignSystemConfig['typography']['roles'][TypographyRoleName]

export const designSystem = designSystemConfig

function fontFamilyValue(fontFamilyName: string) {
  const fontFamily = designSystemConfig.fontFamilies[fontFamilyName as FontFamilyName]
  return fontFamily ? `var(${fontFamily.cssVariable})` : 'inherit'
}

export function getTypographyRole(roleName: TypographyRoleName): TypographyRole {
  return designSystemConfig.typography.roles[roleName]
}

export function typographyStyle(roleName: TypographyRoleName): CSSProperties {
  const role = getTypographyRole(roleName)

  return {
    fontFamily: fontFamilyValue(role.fontFamily),
    fontSize: role.fontSize,
    fontWeight: role.fontWeight,
    letterSpacing: role.letterSpacing,
    lineHeight: role.lineHeight,
  }
}

export function rowTypographyStyle(roleName: TypographyRoleName): CSSProperties {
  const role = getTypographyRole(roleName)

  return {
    ...typographyStyle(roleName),
    height: 'rowHeight' in role ? role.rowHeight : undefined,
  }
}
