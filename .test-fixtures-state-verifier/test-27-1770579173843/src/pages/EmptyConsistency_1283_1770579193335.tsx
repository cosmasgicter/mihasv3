import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
