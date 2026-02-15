import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Profile</h1></div>
    </Suspense>
  );
}

export default Profile;
