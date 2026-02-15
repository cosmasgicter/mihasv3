import React, { Suspense } from 'react';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
