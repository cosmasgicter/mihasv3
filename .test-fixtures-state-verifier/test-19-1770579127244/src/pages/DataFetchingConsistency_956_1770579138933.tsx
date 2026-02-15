import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
