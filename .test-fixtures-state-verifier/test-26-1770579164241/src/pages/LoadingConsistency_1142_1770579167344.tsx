import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Dashboard() {
  const { isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (!data) {
    return <div>No data</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
