import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Applications() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
