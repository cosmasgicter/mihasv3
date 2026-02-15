import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Admin() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
