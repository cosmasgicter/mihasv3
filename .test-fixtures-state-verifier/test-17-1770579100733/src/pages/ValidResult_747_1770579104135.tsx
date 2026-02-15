import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
