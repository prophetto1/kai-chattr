/**
 * Observability API surface — re-exports the contract-bound helpers from
 * `chattr-api-contracts.ts` so existing imports keep working while the
 * endpoint metadata types stay registry-shaped.
 */

export {
  getEndpointContractCoverage,
  getObservabilityStatus,
  getObservedEndpoints,
} from '@/lib/chattr-api-contracts'

export type {
  EndpointContractCoverage,
  EndpointContractMetadata,
  EndpointContractMetadata as ObservedEndpoint,
  ObservabilityStatus,
} from '@/lib/chattr-api-contracts'
