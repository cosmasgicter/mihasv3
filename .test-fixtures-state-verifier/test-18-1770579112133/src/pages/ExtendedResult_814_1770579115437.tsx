import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Dashboard() {
  const { isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
