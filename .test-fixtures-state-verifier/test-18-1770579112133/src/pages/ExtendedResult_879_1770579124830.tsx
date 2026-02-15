import React, { Suspense } from 'react';

export function Admin() {
  
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
