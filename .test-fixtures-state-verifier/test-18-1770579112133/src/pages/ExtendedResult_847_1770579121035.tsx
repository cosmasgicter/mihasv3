import React, { Suspense } from 'react';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
