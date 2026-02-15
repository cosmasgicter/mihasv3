import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
