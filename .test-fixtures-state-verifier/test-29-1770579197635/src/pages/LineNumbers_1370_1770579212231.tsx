import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
