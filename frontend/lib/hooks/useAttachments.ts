import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attachmentsApi, formAttachmentsApi } from '@/lib/api';

export function useWorkflowAttachments(workflowId: string) {
  return useQuery({
    queryKey: ['attachments', 'workflow', workflowId],
    queryFn:  () => attachmentsApi.byWorkflow(workflowId).then((r) => r.attachments),
    enabled:  !!workflowId,
  });
}

export function useFormAttachments(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-attachments', formId],
    queryFn:  () => formAttachmentsApi.list(formId!).then((r) => r.attachments),
    enabled:  !!formId,
  });
}

export function useFormAttachmentMutations(formId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['form-attachments', formId] });

  const add     = useMutation({ mutationFn: ({ attachmentId, rank }: { attachmentId: string; rank: number }) => formAttachmentsApi.add(formId!, attachmentId, rank), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (order: { attachmentId: string; rank: number }[]) => formAttachmentsApi.reorder(formId!, order), onSuccess: invalidate });
  const remove  = useMutation({ mutationFn: (id: string) => formAttachmentsApi.remove(id), onSuccess: invalidate });

  return { add, reorder, remove };
}

export function useUploadAttachment(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(workflowId, file),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['attachments', 'workflow', workflowId] }),
  });
}
