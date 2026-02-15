import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
