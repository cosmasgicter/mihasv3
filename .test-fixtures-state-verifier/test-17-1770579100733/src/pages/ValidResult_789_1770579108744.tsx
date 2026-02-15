import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Settings() {
  const { error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
