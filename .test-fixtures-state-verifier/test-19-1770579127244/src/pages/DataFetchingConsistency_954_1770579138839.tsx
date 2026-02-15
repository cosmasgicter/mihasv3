import React, { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
