import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  const { isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
