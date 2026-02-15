import React, { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  if (!data) {
    return <div>No data</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
