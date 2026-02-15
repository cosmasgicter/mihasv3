import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
