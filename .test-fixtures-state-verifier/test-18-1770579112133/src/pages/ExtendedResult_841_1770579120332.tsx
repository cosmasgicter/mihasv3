import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
