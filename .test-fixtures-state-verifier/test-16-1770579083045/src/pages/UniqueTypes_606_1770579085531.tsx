import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
