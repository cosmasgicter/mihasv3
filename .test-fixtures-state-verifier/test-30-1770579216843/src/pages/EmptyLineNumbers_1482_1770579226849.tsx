import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
