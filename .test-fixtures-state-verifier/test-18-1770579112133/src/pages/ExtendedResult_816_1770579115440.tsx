import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Profile</h1></div>
    </Suspense>
  );
}

export default Profile;
