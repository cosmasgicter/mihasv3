import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
