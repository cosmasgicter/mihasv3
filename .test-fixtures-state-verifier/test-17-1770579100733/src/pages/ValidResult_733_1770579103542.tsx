import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Dashboard() {
  
  
  {isLoading && <Loader />}
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
