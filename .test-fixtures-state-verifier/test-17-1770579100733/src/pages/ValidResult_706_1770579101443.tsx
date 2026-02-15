import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Settings() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
