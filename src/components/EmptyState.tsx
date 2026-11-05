import React from 'react';

const EmptyState: React.FC<{ message: string }> = ({ message }) => {
  return <p className="empty-state">{message}</p>;
};

export default EmptyState;
