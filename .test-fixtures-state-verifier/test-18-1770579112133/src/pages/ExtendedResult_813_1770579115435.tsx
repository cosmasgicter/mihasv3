import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
