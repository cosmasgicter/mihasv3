import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function Applications() {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
