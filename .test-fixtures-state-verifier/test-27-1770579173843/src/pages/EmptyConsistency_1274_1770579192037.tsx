import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
