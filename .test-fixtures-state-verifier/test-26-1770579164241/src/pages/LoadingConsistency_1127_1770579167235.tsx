import React, { Suspense } from 'react';

export function Dashboard() {
  
  
  if (isLoading) {
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
