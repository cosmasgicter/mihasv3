import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
