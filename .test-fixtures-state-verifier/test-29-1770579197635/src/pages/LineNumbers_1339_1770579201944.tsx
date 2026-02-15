import React, { Suspense } from 'react';

export function Dashboard() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
