import React, { Suspense } from 'react';

export function Dashboard() {
  
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
