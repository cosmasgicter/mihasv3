import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
