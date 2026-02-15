import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  <Suspense fallback={<div>Loading...</div>}>
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Profile</h1></div>
    </Suspense>
  );
}

export default Profile;
