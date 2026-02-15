import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
