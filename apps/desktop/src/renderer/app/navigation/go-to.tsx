import type { ButtonHTMLAttributes } from "react";
import { ctaSlug, type RouteId } from "./catalog-id.ts";
import { type RouteParams, useNavigation } from "./navigation-store.tsx";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  to: RouteId;
  cta: string;
  params?: RouteParams;
};

// A control that leads to another screen, dialog or popover; `cta` is the label from the design inventory.
export function GoTo({ to, cta, params, onClick, ...rest }: Props) {
  const go = useNavigation((state) => state.go);
  return (
    <button
      type="button"
      data-cta={ctaSlug(cta)}
      data-goes-to={to}
      onClick={(event) => {
        onClick?.(event);
        go(to, params);
      }}
      {...rest}
    />
  );
}

type ActProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { cta: string };

// A control that acts in place (no navigation).
export function Act({ cta, ...rest }: ActProps) {
  return <button type="button" data-cta={ctaSlug(cta)} {...rest} />;
}

export function useCloseOverlay(): () => void {
  return useNavigation((state) => state.close);
}

// Closes the open dialog or popover and returns to the screen underneath (Close, Cancel, a confirm that stays).
export function CloseOverlay({ cta, onClick, ...rest }: ActProps) {
  const close = useCloseOverlay();
  const screen = useNavigation((state) => state.screen);
  return (
    <button
      type="button"
      data-cta={ctaSlug(cta)}
      data-goes-to={screen}
      onClick={(event) => {
        onClick?.(event);
        close();
      }}
      {...rest}
    />
  );
}
