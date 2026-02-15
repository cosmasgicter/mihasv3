import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
