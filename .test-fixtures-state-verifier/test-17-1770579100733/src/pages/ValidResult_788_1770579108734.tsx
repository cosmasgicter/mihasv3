import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Loader />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
