import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
