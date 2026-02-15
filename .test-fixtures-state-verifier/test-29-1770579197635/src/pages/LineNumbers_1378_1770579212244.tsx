import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
