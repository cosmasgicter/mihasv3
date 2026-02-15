import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  {isLoading && <Loader />}
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
