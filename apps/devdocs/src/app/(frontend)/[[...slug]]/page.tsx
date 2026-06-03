import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  PageLastUpdate,
} from 'fumadocs-ui/layouts/notebook/page'

import { DocPageHeader } from '@/components/docs/DocPageHeader'
import { getMDXComponents } from '@/components/mdx'
import { getPageBreadcrumb, getPageToc, getScopedPageTree } from '@/lib/docs-navigation'
import { source } from '@/lib/source'
import type { ReactNode } from 'react'

export async function generateStaticParams() {
  return source.generateParams()
}

type PageProps = {
  params: Promise<{ slug?: string[] }>
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params
  const page = source.getPage(slug ?? [])

  if (!page) {
    notFound()
  }

  const data = page.data
  const markdownUrl = `${page.url}.md`
  const MdxContent = data.body
  const currentSlug = slug ?? []
  const isHomePage = currentSlug.length === 0
  const scopedTree = getScopedPageTree(source.getPageTree(), currentSlug)
  const breadcrumb = getPageBreadcrumb(scopedTree, currentSlug, page.url)
  const toc = getPageToc(data.toc, isHomePage)
  const lastModified = getLastModified(data)
  const mdxComponents = getMDXComponents(isHomePage ? undefined : { h1: () => null })

  if (!MdxContent) {
    notFound()
  }

  return (
    <DocsPage className="mx-0" breadcrumb={{ enabled: false }} toc={toc}>
      {isHomePage && (
        <>
          <DocPageHeader markdownUrl={markdownUrl}>
            <DocsTitle>{data.title}</DocsTitle>
          </DocPageHeader>
          {data.description && <DocsDescription>{data.description}</DocsDescription>}
        </>
      )}
      {!isHomePage && <PageBreadcrumb items={breadcrumb} />}
      <DocsBody className="kc-prose">
        <MdxContent components={mdxComponents} />
      </DocsBody>
      {lastModified && <PageLastUpdate date={new Date(lastModified)} />}
    </DocsPage>
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug ?? [])

  if (!page) {
    notFound()
  }

  return {
    title: page.data.title,
    description: page.data.description,
  }
}

function PageBreadcrumb({ items }: { items: ReactNode[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="not-prose mb-5 flex flex-wrap items-center gap-1 text-xs font-medium text-fd-muted-foreground"
    >
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-fd-muted-foreground/60">/</span>}
          <span>{item}</span>
        </span>
      ))}
    </nav>
  )
}

function getLastModified(data: unknown): string | number | Date | undefined {
  if (!data || typeof data !== 'object' || !('lastModified' in data)) {
    return undefined
  }

  const value = (data as { lastModified?: unknown }).lastModified

  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    return value
  }

  return undefined
}
