import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
