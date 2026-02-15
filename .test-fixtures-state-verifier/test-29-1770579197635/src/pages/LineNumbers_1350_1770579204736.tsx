import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Admin() {
  
  
  {isLoading && <Loader />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
