import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
