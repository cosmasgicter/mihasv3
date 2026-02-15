import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data, isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
