import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
