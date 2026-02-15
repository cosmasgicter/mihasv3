import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
