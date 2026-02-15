import React, { Suspense } from 'react';

export function Dashboard() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  
  if (!data) {
    return <div>No data</div>;
  }
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
