import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
