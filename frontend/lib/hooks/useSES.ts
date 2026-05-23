import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sesApi } from '@/lib/api';
import type { SesFields } from '@/types';

export function useSesFormByWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ['ses', 'workflow', workflowId],
    queryFn:  () => sesApi.byWorkflow(workflowId).then((r) => r.form),
    enabled:  !!workflowId,
    retry:    false, // 404 means no form yet — don't retry
  });
}


export function useSesForm(formId: string) {
  return useQuery({ queryKey: ['ses', formId], queryFn: () => sesApi.get(formId).then((r) => r.form), enabled: !!formId });
}

export function useSesVersions(formId: string) {
  return useQuery({ queryKey: ['ses', formId, 'versions'], queryFn: () => sesApi.versions(formId).then((r) => r.versions), enabled: !!formId });
}

export function useSesMutations(formId?: string) {
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: SesFields }) => sesApi.update(id, fields),
    onSuccess: () => {
      if (formId) qc.invalidateQueries({ queryKey: ['ses', formId] });
    },
  });

  const submit = useMutation({
    mutationFn: (id: string) => sesApi.submit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      if (formId) qc.invalidateQueries({ queryKey: ['ses', formId] });
    },
  });

  const autofill = useMutation({
    mutationFn: ({ vendorName, poNumber }: { vendorName: string; poNumber?: string }) =>
      sesApi.autofill(vendorName, poNumber).then((r) => r.data),
  });

  return { update, submit, autofill };
}
