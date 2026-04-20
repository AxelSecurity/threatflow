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

export function useSource(id: string) {
  return useQuery({
    queryKey: ['sources', id],
    queryFn: () => api.sources.get(id),
    enabled: !!id,
  })
}

export function useSourceLogs(id: string) {
  return useQuery({
    queryKey: ['source-logs', id],
    queryFn: () => api.sources.logs(id),
    enabled: !!id,
    refetchInterval: 5000,
  })
}

export function useSourceIocs(id: string, page: number, size: number) {
  return useQuery({
    queryKey: ['source-iocs', id, page, size],
    queryFn: () => api.sources.iocs(id, page, size),
    enabled: !!id,
    placeholderData: (prev: IocList | undefined) => prev,
  })
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

export function useFlow(id: string | null) {
  return useQuery({ 
    queryKey: ['flows', id], 
    queryFn: () => api.flows.get(id!),
    enabled: !!id 
  })
}


export function useFlowLogs(id: string | null) {
  return useQuery({
    queryKey: ['flow-logs', id],
    queryFn: () => api.flows.logs(id!),
    enabled: !!id,
    refetchInterval: 5000,
  })
}

export function useNodeStats(id: string | null) {
  return useQuery({
    queryKey: ['flow-node-stats', id],
    queryFn: () => api.flows.nodeStats(id!),
    enabled: !!id,
    refetchInterval: 10000,
  })
}

export function useNodeAging(id: string | null, nid: string | null, params: any) {
  return useQuery({
    queryKey: ['flow-node-aging', id, nid, params],
    queryFn: () => api.flows.nodeAging(id!, nid!, params),
    enabled: !!id && !!nid,
    refetchInterval: 10000,
  })
}

export function useCreateFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; definition: object }) => api.flows.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  })
}

export function useUpdateFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.flows.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  })
}

export function useRunFlow() {
  return useMutation({
    mutationFn: (id: string) => api.flows.run(id),
  })
}

export function useDeleteFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.flows.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  })
}

