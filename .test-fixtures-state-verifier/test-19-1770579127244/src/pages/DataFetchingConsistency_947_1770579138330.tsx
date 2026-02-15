import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Settings</h1></div>
    </Suspense>
  );
}

export default Settings;
