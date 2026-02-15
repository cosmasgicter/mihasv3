
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function SkeletonPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  return (
    <div>
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div>{JSON.stringify(data)}</div>
      )}
    </div>
  );
}
