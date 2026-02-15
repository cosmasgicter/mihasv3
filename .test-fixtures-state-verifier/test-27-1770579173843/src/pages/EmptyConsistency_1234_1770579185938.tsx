import React, { Suspense } from 'react';

export function Admin() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Admin</h1></div>
    </Suspense>
  );
}

export default Admin;
