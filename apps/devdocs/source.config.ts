import {
  rehypeCodeDefaultOptions,
  remarkDirectiveAdmonition,
  remarkMdxMermaid,
  remarkSteps,
} from 'fumadocs-core/mdx-plugins'
import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import remarkDirective from 'remark-directive'

export const docs = defineDocs({
  dir: 'content',
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (plugins) => [
      ...plugins,
      remarkDirective,
      remarkDirectiveAdmonition,
      remarkMdxMermaid,
      remarkSteps,
    ],
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'one-dark-pro',
      },
      inline: 'tailing-curly-colon',
      transformers: [...(rehypeCodeDefaultOptions.transformers ?? [])],
    },
  },
})
