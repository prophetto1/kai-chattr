import { KaiChattrNavBrand } from '@/components/brand/KaiChattrBrand'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <KaiChattrNavBrand />,
      url: '/',
    },
    themeSwitch: {
      enabled: true,
    },
    searchToggle: {
      enabled: false,
    },
  }
}
