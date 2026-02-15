import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
