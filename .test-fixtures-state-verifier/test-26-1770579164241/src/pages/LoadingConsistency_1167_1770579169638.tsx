import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
