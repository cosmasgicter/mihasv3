import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
