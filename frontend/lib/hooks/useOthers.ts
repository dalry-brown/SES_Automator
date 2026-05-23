import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { othersApi } from '@/lib/api';
import type { ManualItem } from '@/types';

export function useOthers() {
  return useQuery({ queryKey: ['others'], queryFn: () => othersApi.list().then((r) => r.items) });
}

export function useOthersMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['others'] });

  const create  = useMutation({ mutationFn: (body: Partial<ManualItem>) => othersApi.create(body), onSuccess: invalidate });
  const update  = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<ManualItem> }) => othersApi.update(id, body), onSuccess: invalidate });
  const close   = useMutation({ mutationFn: (id: string) => othersApi.close(id), onSuccess: invalidate });
  const reopen  = useMutation({ mutationFn: (id: string) => othersApi.reopen(id), onSuccess: invalidate });
  const convert = useMutation({
    mutationFn: (id: string) => othersApi.convert(id),
    onSuccess:  () => { invalidate(); qc.invalidateQueries({ queryKey: ['workflows'] }); },
  });
  const remove  = useMutation({ mutationFn: (id: string) => othersApi.delete(id), onSuccess: invalidate });

  return { create, update, close, reopen, convert, remove };
}
