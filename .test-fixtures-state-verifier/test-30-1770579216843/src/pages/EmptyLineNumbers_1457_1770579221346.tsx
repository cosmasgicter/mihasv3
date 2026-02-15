import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
