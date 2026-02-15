import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { isPending, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
