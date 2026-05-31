import { loader } from 'fumadocs-core/source'

import { docs } from 'collections/server'

export const source = loader(
  {
    docs: docs.toFumadocsSource(),
  },
  {
    baseUrl: '/',
  },
)

export function getDocsSource() {
  return source
}
