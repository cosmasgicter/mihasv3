import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Dashboard() {
  const { isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
