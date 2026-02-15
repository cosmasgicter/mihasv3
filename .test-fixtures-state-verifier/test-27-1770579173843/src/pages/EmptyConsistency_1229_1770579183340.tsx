import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
