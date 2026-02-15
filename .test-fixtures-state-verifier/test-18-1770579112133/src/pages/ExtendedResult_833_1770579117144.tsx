import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

export function Admin() {
  const { data, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
