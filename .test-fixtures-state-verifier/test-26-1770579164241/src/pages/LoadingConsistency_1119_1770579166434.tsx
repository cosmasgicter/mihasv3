import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
