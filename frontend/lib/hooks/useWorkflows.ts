import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowsApi } from '@/lib/api';

export function useWorkflows() {
  return useQuery({ queryKey: ['workflows'], queryFn: () => workflowsApi.list().then((r) => r.workflows) });
}

export function useWorkflowStats() {
  return useQuery({ queryKey: ['workflows', 'stats'], queryFn: () => workflowsApi.stats().then((r) => r.stats) });
}

export function useWorkflow(id: string) {
  return useQuery({ queryKey: ['workflows', id], queryFn: () => workflowsApi.get(id).then((r) => r.workflow), enabled: !!id });
}

export function useWorkflowMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['workflows'] });

  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => workflowsApi.setStatus(id, status), onSuccess: invalidate });
  const acquireLock = useMutation({ mutationFn: (id: string) => workflowsApi.acquireLock(id), onSuccess: invalidate });
  const releaseLock = useMutation({ mutationFn: (id: string) => workflowsApi.releaseLock(id), onSuccess: invalidate });

  return { setStatus, acquireLock, releaseLock };
}
