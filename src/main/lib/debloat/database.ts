import { DebloatSafety } from 'common/types'

export interface IBloatwareEntry {
  package: string
  name: string
  manufacturer: string
  category: DebloatSafety
  description: string
  dependencies: string
}

// No static mockups: All analysis is fetched dynamically via Gemini IA + ADB live packages
export const BLOATWARE_DATABASE: IBloatwareEntry[] = []
