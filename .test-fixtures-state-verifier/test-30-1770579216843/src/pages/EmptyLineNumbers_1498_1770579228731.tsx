import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Dashboard() {
  const { isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
