import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Settings() {
  const { error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
