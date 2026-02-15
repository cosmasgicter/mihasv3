import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isPending, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
