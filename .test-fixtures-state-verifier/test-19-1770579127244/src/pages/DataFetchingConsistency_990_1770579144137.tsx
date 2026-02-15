import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
