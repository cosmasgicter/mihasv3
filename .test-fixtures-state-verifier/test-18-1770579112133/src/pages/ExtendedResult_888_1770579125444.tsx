import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
