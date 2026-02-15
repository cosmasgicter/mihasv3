import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Loader />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
