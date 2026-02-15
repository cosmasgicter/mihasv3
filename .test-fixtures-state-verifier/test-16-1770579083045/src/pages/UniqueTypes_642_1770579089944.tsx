import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
