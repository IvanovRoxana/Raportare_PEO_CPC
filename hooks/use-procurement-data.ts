'use client';

import useSWR from 'swr';
import { isAwsAvailable } from '@/lib/aws/client';
import { getContractedProcurementProjects } from '@/lib/procurement';
import { procurementProjectsService } from '@/lib/procurement-store';

export function useProcurementProjects() {
  const { data, error, isLoading, mutate } = useSWR(
    isAwsAvailable() ? 'procurement-projects' : null,
    () => procurementProjectsService.getAll(),
  );

  return {
    procurementProjects: data ?? getContractedProcurementProjects(),
    isLoading: isAwsAvailable() ? isLoading : false,
    error,
    mutate,
  };
}
