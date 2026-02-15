import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/Loader';

export function Applications() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
