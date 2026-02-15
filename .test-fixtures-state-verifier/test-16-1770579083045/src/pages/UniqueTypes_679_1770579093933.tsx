import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
