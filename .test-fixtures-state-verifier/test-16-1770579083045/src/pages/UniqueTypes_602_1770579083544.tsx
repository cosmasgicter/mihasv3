import React, { Suspense } from 'react';

export function Dashboard() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
