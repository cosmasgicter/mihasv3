import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
