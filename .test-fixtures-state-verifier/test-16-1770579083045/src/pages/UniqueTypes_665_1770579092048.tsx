import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  
  
  {isLoading && <Loader />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
