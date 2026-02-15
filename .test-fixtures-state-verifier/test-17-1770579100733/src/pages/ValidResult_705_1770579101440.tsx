import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
