import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Suspense fallback={<div>Loading...</div>}>
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Settings</h1></div>
    </Suspense>
  );
}

export default Settings;
