import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
