import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
