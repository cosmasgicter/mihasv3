import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  <Suspense fallback={<div>Loading...</div>}>
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Admin</h1></div>
    </Suspense>
  );
}

export default Admin;
