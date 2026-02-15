import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  <Suspense fallback={<div>Loading...</div>}>
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
