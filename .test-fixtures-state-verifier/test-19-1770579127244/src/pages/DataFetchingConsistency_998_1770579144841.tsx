import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
