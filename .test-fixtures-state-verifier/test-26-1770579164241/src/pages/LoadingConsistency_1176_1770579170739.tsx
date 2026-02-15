import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
