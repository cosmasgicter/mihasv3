import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
