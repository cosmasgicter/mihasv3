import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
