import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Dashboard() {
  
  
  {isLoading && <Loader />}
  <Button loading={isLoading}>Submit</Button>
  
  if (!data) {
    return <div>No data</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
