import { KaiChattrNavBrand } from '@/components/brand/KaiChattrBrand'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { KAI_CHATTR_WEB_URL } from '@/config/site'

const kaiChattrAppUrl = KAI_CHATTR_WEB_URL

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <KaiChattrNavBrand />,
      url: '/',
    },
    links: [
      {
        text: 'kai · chattr app',
        url: kaiChattrAppUrl,
        active: 'none',
        secondary: true,
      },
    ],
    themeSwitch: {
      enabled: true,
    },
    searchToggle: {
      enabled: false,
    },
  }
}
