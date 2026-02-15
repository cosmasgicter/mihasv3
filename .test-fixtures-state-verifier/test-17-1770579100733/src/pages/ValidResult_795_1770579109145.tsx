import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
