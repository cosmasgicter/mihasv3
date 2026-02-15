import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
