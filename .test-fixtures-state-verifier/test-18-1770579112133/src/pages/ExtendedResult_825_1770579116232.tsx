import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isPending, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
