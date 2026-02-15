import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Dashboard() {
  const { isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
