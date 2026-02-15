import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Spinner size="md" />}
  
  {!data?.length && <p>"No results found"</p>}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
