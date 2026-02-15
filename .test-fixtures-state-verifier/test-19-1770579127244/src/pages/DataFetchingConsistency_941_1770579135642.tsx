import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Admin() {
  const { data } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
