import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
