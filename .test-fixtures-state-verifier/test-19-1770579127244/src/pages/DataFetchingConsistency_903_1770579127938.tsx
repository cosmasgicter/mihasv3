import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
