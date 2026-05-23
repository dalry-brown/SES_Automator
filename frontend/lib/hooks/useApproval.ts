import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalApi } from '@/lib/api';

export function useApprovalData(workflowId: string) {
  return useQuery({
    queryKey: ['approval', workflowId],
    queryFn:  () => approvalApi.pageData(workflowId),
    enabled:  !!workflowId,
  });
}

export function useApprovalMutations(workflowId: string) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['approval', workflowId] });
    qc.invalidateQueries({ queryKey: ['workflows'] });
  };

  const sign = useMutation({
    mutationFn: (signatureDataUrl?: string) => approvalApi.sign(workflowId, signatureDataUrl),
    onSuccess: invalidate,
  });

  const comment = useMutation({
    mutationFn: (text: string) => approvalApi.comment(workflowId, text),
    onSuccess: invalidate,
  });

  const query = useMutation({
    mutationFn: (text: string) => approvalApi.query(workflowId, text),
    onSuccess: invalidate,
  });

  const returnDoc = useMutation({
    mutationFn: (text: string) => approvalApi.return(workflowId, text),
    onSuccess: invalidate,
  });

  const reroute = useMutation({
    mutationFn: ({ email, name }: { email: string; name: string }) =>
      approvalApi.reroute(workflowId, email, name),
    onSuccess: invalidate,
  });

  const reply = useMutation({
    mutationFn: (text: string) => approvalApi.reply(workflowId, text),
    onSuccess: invalidate,
  });

  const sendToVendor = useMutation({
    mutationFn: (recipients: { toRecipients: { name: string; address: string }[]; ccRecipients: { name: string; address: string }[] }) =>
      approvalApi.sendToVendor(workflowId, recipients),
    onSuccess: invalidate,
  });

  return { sign, comment, query, returnDoc, reroute, reply, sendToVendor };
}
