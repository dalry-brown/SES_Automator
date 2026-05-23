import { useQuery } from '@tanstack/react-query';
import { trackerApi } from '@/lib/api';

export function useTrackerRecords(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['tracker', 'records', params],
    queryFn:  () => trackerApi.list(params).then((r) => r.records),
  });
}

export function useTrackerStats(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['tracker', 'stats', params],
    queryFn:  () => trackerApi.stats(params).then((r) => r.stats),
  });
}
