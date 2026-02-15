import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
