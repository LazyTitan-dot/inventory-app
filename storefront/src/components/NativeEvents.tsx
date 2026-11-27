import * as React from 'react';
import type { NativeAction, NativeDispatch } from '../integration/shop-actions';
export const NativeEvents = React.createContext<NativeDispatch | undefined>(undefined);
export function ActionButton({
  action,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { action: NativeAction }) {
  const dispatch = React.useContext(NativeEvents);
  return (
    <button
      {...rest}
      onClick={
        dispatch
          ? (e) => {
              e.stopPropagation();
              dispatch(action, e.currentTarget);
            }
          : onClick
      }
    />
  );
}
export function useCardEvents(action: NativeAction) {
  const dispatch = React.useContext(NativeEvents);
  return dispatch
    ? {
        'data-native-card': '',
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          if ((e.target as Element).closest('button,a,input,select,label')) return;
          e.preventDefault();
          e.stopPropagation();
          dispatch(action, e.currentTarget);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
          if (e.target !== e.currentTarget || !['Enter', ' '].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          dispatch(action, e.currentTarget);
        },
      }
    : {};
}
export function BrandCheckbox({ brand, checked }: { brand: string; checked: boolean }) {
  const dispatch = React.useContext(NativeEvents);
  return (
    <input
      type="checkbox"
      data-brand-filter={brand}
      checked={checked}
      onChange={
        dispatch
          ? (e) => {
              e.stopPropagation();
              dispatch(
                { type: 'brand', brand, selected: e.currentTarget.checked },
                e.currentTarget,
              );
            }
          : undefined
      }
    />
  );
}
