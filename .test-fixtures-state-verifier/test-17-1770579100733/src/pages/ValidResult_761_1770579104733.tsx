import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
