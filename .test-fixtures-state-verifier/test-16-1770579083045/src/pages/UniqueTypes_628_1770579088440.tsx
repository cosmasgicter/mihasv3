import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function Applications() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Spinner size="md" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
