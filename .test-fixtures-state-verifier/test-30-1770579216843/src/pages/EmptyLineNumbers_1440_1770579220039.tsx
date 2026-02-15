import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
