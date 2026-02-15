import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
