import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, IocList } from '../lib/api'

export function useIocs(filters: Record<string, string | number>) {
  return useQuery({
    queryKey: ['iocs', filters],
    queryFn: () => api.iocs.list(filters),
    placeholderData: (prev: IocList | undefined) => prev,
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

export function useCreateSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: object) => api.sources.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}

export function useToggleSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.sources.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}

export function useDeleteSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.sources.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}

export function useFlows() {
  return useQuery({ queryKey: ['flows'], queryFn: api.flows.list })
}
