import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Button loading={isLoading}>Submit</Button>
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
