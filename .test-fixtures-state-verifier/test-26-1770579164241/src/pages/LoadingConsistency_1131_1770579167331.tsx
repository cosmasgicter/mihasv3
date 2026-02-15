import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  if (loading) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Profile</h1></div>
    </Suspense>
  );
}

export default Profile;
