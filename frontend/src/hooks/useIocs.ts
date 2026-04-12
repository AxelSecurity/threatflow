import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useIocs(filters: Record<string, string | number>) {
  return useQuery({
    queryKey: ['iocs', filters],
    queryFn: () => api.iocs.list(filters),
    placeholderData: (prev: unknown) => prev,
  })
}

export function useDeleteIoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.iocs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['iocs'] }),
  })
}

export function useSources() {
  return useQuery({ queryKey: ['sources'], queryFn: api.sources.list })
}

export function useFlows() {
  return useQuery({ queryKey: ['flows'], queryFn: api.flows.list })
}
