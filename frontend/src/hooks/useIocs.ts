import { useQuery } from '@tanstack/react-query'
import { fetchIocs } from '../lib/api'

interface IocFilters {
  q?: string; ioc_type?: string; status?: string
  min_score?: number; page: number; size: number
}

export function useIocs(filters: IocFilters) {
  return useQuery({
    queryKey: ['iocs', filters],
    queryFn: () => fetchIocs(filters as Record<string, string | number>),
    placeholderData: (prev: unknown) => prev,
    staleTime: 30_000,
  })
}
