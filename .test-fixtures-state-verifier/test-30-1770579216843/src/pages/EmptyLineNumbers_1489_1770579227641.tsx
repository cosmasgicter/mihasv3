import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  
  
  {!data?.length && <p>"No results found"</p>}
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
