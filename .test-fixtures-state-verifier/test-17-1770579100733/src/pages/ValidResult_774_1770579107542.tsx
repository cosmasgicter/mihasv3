import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
