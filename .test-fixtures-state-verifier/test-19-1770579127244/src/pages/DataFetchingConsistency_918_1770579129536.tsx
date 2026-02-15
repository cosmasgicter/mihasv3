import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  const { data, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Suspense fallback={<div>Loading...</div>}>
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
