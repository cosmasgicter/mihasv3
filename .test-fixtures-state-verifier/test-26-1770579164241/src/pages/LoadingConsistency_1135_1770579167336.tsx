import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Profile() {
  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
