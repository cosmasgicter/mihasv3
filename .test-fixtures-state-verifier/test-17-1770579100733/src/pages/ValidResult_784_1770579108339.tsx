import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
