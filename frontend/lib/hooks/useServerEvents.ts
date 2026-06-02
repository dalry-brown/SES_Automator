'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getStoredToken } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function useServerEvents() {
  const qc = useQueryClient();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    const es = new EventSource(`${API}/api/events?token=${encodeURIComponent(token)}`);

    es.addEventListener('email.new', () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    });

    es.addEventListener('reply.sent', (e: MessageEvent) => {
      try {
        const { workflowId } = JSON.parse(e.data) as { workflowId: string };
        qc.invalidateQueries({ queryKey: ['messages', workflowId] });
        qc.invalidateQueries({ queryKey: ['emails'] });
        qc.invalidateQueries({ queryKey: ['workflows'] });
      } catch (_) {}
    });

    es.addEventListener('workflow.updated', (e: MessageEvent) => {
      try {
        const { workflowId } = JSON.parse(e.data) as { workflowId: string };
        qc.invalidateQueries({ queryKey: ['workflows'] });
        qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
        qc.invalidateQueries({ queryKey: ['approval', workflowId] });
      } catch (_) {}
    });

    return () => es.close();
  }, [qc]);
}
