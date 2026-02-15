import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Settings() {
  const { isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
