import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
