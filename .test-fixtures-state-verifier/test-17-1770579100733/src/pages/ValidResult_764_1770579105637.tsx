import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Dashboard() {
  const { isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
