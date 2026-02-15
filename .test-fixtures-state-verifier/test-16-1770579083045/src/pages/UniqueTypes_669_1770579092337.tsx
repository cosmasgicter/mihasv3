import React, { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
