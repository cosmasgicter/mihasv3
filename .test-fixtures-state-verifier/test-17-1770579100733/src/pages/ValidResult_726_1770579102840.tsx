import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
