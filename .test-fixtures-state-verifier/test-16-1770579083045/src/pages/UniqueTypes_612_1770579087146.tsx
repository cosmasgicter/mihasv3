import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
