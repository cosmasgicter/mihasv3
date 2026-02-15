import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
