import React, { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

export function Admin() {
  
  
  {isLoading && <Spinner size="md" />}
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
