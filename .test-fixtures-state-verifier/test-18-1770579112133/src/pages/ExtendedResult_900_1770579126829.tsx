import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
