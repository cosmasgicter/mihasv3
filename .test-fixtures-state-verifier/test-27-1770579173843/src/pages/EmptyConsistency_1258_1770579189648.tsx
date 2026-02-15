import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
