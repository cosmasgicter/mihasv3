import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
