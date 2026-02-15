import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
