import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Admin() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
