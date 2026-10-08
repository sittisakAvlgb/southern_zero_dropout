// Compatibility surface over data/places.ts.
// Pages that predate the ตำบล→อำเภอ→จังหวัด roll-up import from here; the
// aggregate is now the จชต. area rather than the whole country, so NATIONAL_*
// keeps its shape but means "region-wide".
import type { CauseWeight, Province, Region } from '@/types'
import {
  PROVINCES,
  PROVINCE_BY_KEY,
  REGION_DELTAS,
  REGION_TOTALS,
  regionCauseDistribution,
  topRiskProvinces,
  topSuccessProvinces,
} from './places'

export {
  PROVINCES,
  PROVINCE_BY_KEY,
  topRiskProvinces,
  topSuccessProvinces,
}

export const NATIONAL = REGION_TOTALS
export const NATIONAL_DELTAS = REGION_DELTAS

export function provincesByRegion(region: Region | 'all'): Province[] {
  return region === 'all' ? PROVINCES : PROVINCES.filter((p) => p.region === region)
}

export function nationalCauseDistribution(): CauseWeight[] {
  return regionCauseDistribution()
}
