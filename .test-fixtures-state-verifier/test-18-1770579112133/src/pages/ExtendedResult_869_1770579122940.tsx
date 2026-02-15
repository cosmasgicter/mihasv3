import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
