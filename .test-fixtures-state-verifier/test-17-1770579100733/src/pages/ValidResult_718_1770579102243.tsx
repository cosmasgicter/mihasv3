import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
