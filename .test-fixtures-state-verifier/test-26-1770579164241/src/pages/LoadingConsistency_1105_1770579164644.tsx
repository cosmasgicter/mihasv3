import React, { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

export function Profile() {
  
  
  {isLoading && <Spinner size="md" />}
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
