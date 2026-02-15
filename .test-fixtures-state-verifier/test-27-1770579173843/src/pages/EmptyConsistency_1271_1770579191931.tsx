import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/Loader';

export function Dashboard() {
  const { isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Loader />}
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
