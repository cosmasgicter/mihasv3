import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
