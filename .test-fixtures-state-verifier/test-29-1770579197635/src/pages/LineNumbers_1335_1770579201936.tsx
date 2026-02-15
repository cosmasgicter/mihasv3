import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
