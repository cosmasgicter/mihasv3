import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { data } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
