import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
