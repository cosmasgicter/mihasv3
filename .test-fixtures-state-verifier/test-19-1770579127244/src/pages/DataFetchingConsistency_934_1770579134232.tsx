import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data, isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
