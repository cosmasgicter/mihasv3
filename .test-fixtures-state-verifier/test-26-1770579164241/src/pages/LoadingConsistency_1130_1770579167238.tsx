import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
