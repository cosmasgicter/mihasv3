import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Admin() {
  
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Loader />}
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
