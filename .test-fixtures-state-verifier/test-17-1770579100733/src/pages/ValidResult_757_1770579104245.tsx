import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
