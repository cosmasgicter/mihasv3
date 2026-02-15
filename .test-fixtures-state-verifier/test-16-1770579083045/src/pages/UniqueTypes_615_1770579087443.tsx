import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Dashboard() {
  const { error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
