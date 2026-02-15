import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
