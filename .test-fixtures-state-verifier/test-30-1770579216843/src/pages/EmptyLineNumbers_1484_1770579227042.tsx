import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
