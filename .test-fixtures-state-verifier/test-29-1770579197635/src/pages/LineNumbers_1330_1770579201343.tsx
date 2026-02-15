import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
