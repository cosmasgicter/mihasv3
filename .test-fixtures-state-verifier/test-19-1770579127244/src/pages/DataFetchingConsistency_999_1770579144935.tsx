import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
