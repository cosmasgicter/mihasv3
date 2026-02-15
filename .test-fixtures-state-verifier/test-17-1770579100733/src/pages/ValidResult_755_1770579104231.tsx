import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Profile</h1></div>
    </Suspense>
  );
}

export default Profile;
