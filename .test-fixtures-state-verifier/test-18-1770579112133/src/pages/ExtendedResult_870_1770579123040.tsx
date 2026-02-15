import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
