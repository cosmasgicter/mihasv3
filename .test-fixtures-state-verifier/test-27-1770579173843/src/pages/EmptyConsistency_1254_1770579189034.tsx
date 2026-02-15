import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
