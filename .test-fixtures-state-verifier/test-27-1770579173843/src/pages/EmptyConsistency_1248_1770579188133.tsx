import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
