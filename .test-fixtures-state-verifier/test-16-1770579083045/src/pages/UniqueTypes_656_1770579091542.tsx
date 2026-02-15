import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
