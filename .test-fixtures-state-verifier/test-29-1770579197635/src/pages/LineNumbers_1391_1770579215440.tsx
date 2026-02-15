import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data, isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
