import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Loader />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
