import { useContext } from 'react';
import { RetailContext } from './RetailContext';

export function useRetail() {
  const context = useContext(RetailContext);
  if (!context) throw new Error('RetailProvider es obligatorio.');
  return context;
}
