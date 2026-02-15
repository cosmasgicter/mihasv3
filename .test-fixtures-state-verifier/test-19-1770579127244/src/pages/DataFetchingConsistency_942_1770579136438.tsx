import React, { Suspense } from 'react';

export function Admin() {
  
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
