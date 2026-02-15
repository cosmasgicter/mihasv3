import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
