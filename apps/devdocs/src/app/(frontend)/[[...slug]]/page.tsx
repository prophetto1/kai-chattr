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
import { getDocsSource } from '@/lib/source'

export async function generateStaticParams() {
  return getDocsSource().generateParams()
}

type PageProps = {
  params: Promise<{ slug?: string[] }>
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params
  const page = getDocsSource().getPage(slug ?? [])

  if (!page) {
    notFound()
  }

  const data = page.data
  const markdownUrl = `${page.url}.md`
  const MdxContent = data.body

  if (!MdxContent) {
    notFound()
  }

  return (
    <DocsPage className="mx-0" toc={data.toc}>
      <DocPageHeader markdownUrl={markdownUrl}>
        <DocsTitle>{data.title}</DocsTitle>
      </DocPageHeader>
      {data.description && <DocsDescription>{data.description}</DocsDescription>}
      <DocsBody className="kc-prose">
        <MdxContent components={getMDXComponents()} />
      </DocsBody>
      {data.lastModified && <PageLastUpdate date={new Date(data.lastModified)} />}
    </DocsPage>
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = getDocsSource().getPage(slug ?? [])

  if (!page) {
    notFound()
  }

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
